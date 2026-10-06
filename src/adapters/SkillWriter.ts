/**
 * 投放写盘适配器（REQ-261005122347-e07a FR-6 / ports.SkillInstallPort）。
 *
 * ## 为什么是"临时目录 + 整体改名"，而不是就地逐文件写
 *
 * 半份资产比没有更坏：子代理会读到**混版** skill（一半新规则、一半旧），然后据此产出原型，
 * 事后完全看不出是哪一版。所以写盘必须是**事务**：先写 `<root>.tmp-<id>`，逐文件校验 sha256，
 * 全部通过才 `rename` 顶替；任何一步失败都删掉临时目录，让目标目录**从头到尾没被碰过**。
 * 这与 `scripts/migrate-ledger-to-sqlite.ts` 的"暂存库顶上"是同一条纪律。
 *
 * 代价（已记入完工记录，可被人否决）：`rename` 顶替是**整体替换**，投放根内非本插件写入的文件
 * 会被清掉。该目录是插件自定约定、写了 `.gitignore(*)` 的**受管目录**，设计里也写明
 * 「`rm -rf <root>` 即完全回滚」——把它当整体所有物是一致的。
 *
 * @module dsh-pmboard/adapters/SkillWriter
 */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type { SkillInstallPort, SkillWriteFile, SkillWriteReceipt } from '../application/ports.js'
import type { SkillFileFingerprint } from '../application/internal/skill-manifest.js'

/** 投放根内的元数据文件：**不算资产**（清单/自忽略），故不进 `readTree` 的指纹表。 */
const META_FILES = new Set(['.manifest.json', '.gitignore'])

export interface SkillWriterOptions {
  /** 临时/备份目录后缀用的 id 工厂（测试可注入固定值）。 */
  readonly idFactory?: () => string
}

export class SkillWriter implements Pick<SkillInstallPort, 'writeTree' | 'readTree' | 'readManifest'> {
  private readonly idFactory: () => string

  constructor(options: SkillWriterOptions = {}) {
    this.idFactory = options.idFactory ?? randomUUID
  }

  async writeTree(root: string, files: readonly SkillWriteFile[]): Promise<SkillWriteReceipt> {
    const id = this.idFactory()
    const tmp = root + '.tmp-' + id
    const backup = root + '.old-' + id
    try {
      await rm(tmp, { recursive: true, force: true })
      for (const file of files) {
        // **写临时目录**，不是目标根：写目标根就等于放弃事务（半份资产会直接落在用得上它的地方）。
        // 这条曾写错过一次，被 TC-6 的「失败不留半份」用例逮住。
        const abs = join(tmp, file.rel)
        await mkdir(dirname(abs), { recursive: true })
        await writeFile(abs, file.content)
      }

      // 逐文件校验：声明了哈希就必须与实写一致（防"写了一半/写坏了却顶替上去"）。
      const actual = await this.fingerprintTree(tmp)
      for (const file of files) {
        if (file.sha256 === undefined) continue
        const got = actual[file.rel]
        if (got === undefined || got.sha256 !== file.sha256.toLowerCase()) {
          throw new Error('写盘校验失败：' + file.rel + ' 期望 ' + file.sha256 + '，实测 ' + (got?.sha256 ?? '缺失'))
        }
      }

      // 整体顶替：先把既有根挪走，再把临时目录改名就位，最后清掉备份。
      await rm(backup, { recursive: true, force: true })
      if (existsSync(root)) await rename(root, backup)
      await rename(tmp, root)
      await rm(backup, { recursive: true, force: true })

      const assetFiles: Record<string, SkillFileFingerprint> = {}
      let bytes = 0
      for (const rel of Object.keys(actual)) {
        const f = actual[rel]!
        assetFiles[rel] = f
        bytes += f.bytes
      }
      return { files: assetFiles, bytes }
    } catch (err) {
      await rm(tmp, { recursive: true, force: true }).catch(() => {})
      await rm(backup, { recursive: true, force: true }).catch(() => {})
      throw Object.assign(
        new Error('投放写盘失败（REQBOARD_SKILLS_WRITE_FAILED）：' + String((err as Error).message)),
        { code: 'REQBOARD_SKILLS_WRITE_FAILED' },
      )
    }
  }

  async readTree(root: string): Promise<Readonly<Record<string, SkillFileFingerprint>>> {
    return await this.fingerprintTree(root)
  }

  async readManifest(root: string): Promise<string | undefined> {
    try {
      return await readFile(join(root, '.manifest.json'), 'utf8')
    } catch {
      return undefined
    }
  }

  /** 递归算指纹（**跳过元数据文件**；目录不存在 → 空表，不抛）。 */
  private async fingerprintTree(root: string): Promise<Record<string, SkillFileFingerprint>> {
    const out: Record<string, SkillFileFingerprint> = {}
    for (const rel of walkFiles(root)) {
      if (META_FILES.has(rel)) continue
      const buf = await readFile(join(root, rel))
      out[rel] = { sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.byteLength }
    }
    return out
  }
}

/** 递归列文件（相对 root 的 POSIX 路径，排序后）。 */
function walkFiles(root: string): string[] {
  const out: string[] = []
  const visit = (dir: string): void => {
    let names: string[]
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const name of names) {
      const abs = join(dir, name)
      let isDir = false
      try {
        isDir = statSync(abs).isDirectory()
      } catch {
        continue
      }
      if (isDir) visit(abs)
      else out.push(relative(root, abs).split(sep).join('/'))
    }
  }
  visit(root)
  return out.sort()
}
