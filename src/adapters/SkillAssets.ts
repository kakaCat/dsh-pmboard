/**
 * skill 资产读适配器（REQ-261005122347-e07a FR-1 / FR-8 / ports.SkillAssetPort）。
 *
 * 解包根：与 `adapters/TemplateRoot` **同一条规则**——源码态（`src/index.ts`）与构建态
 * （`dist/index.mjs`）都把 `moduleDir` 的上一级当包根，故 `<'..', 'skills'>` 两种形态同解。
 * 这是本仓「包根非 TS 资产如何被运行时读取」的既有唯一范式（需求 E-4），不另立第二套。
 *
 * @module dsh-pmboard/adapters/SkillAssets
 */
import { createHash } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { SkillAssetContent, SkillAssetPort } from '../application/ports.js'

export interface SkillAssetsOptions {
  /** 组合根模块所在目录（源码态 `<pkg>/src`、构建态 `<pkg>/dist`）。 */
  readonly moduleDir: string
  /** 资产根绝对路径；缺省 = `<moduleDir>/../skills`（测试可覆盖）。 */
  readonly root?: string
}

/** 资产缺失/读不到统一走这个码：装机漏打包时子代理能一眼看出是"包里没有"，不是"用错了"。 */
function missing(message: string): never {
  throw Object.assign(new Error(message + '（REQBOARD_SKILLS_ASSET_MISSING）'), { code: 'REQBOARD_SKILLS_ASSET_MISSING' })
}

export class SkillAssets implements SkillAssetPort {
  private readonly root: string

  constructor(options: SkillAssetsOptions) {
    this.root = options.root ?? resolve(options.moduleDir, '..', 'skills')
  }

  /** 资产根绝对路径（组合根/诊断用）。 */
  rootDir(): string {
    return this.root
  }

  listSkills(): readonly string[] {
    // 按**名字**排序，不是按 `名字/` 排序：后者会把 `design-system` 排到 `design` 前面
    // （'/' 0x2F > '-' 0x2D），与"目录名字典序"的直觉不一致，也让清单比对看起来像错了。
    return this.walk(this.root, '')
      .filter(e => e.endsWith('/'))
      .map(e => e.slice(0, -1))
      .sort()
  }

  listFiles(skill: string): readonly string[] {
    // 前缀必须以 '/' 结尾：否则 `brand` + `SKILL.md` 会拼成 `brandSKILL.md`（实测踩过）。
    const prefix = skill.endsWith('/') ? skill : skill + '/'
    return this.walk(join(this.root, skill), prefix)
  }

  async readAsset(rel: string): Promise<SkillAssetContent> {
    const abs = join(this.root, rel)
    let buf: Buffer
    try {
      buf = await readFile(abs)
    } catch (err) {
      return missing('包内资产读不到：' + abs + '（' + String((err as Error).message) + '）')
    }
    return { content: buf, sha256: sha256Hex(buf) }
  }

  async readProvenance(): Promise<string> {
    try {
      return await readFile(join(this.root, 'PROVENANCE.md'), 'utf8')
    } catch (err) {
      return missing('包内缺 skills/PROVENANCE.md（' + String((err as Error).message) + '）')
    }
  }

  /**
   * 递归列目录。只回**文件**（相对 base 的 POSIX 路径）；一级子目录以 `名字/` 形式回，
   * 供 `listSkills` 取用——一次遍历同时服务两个方法，避免两套排序口径。
   */
  private walk(dir: string, prefix: string): string[] {
    const out: string[] = []
    const entries = readdirSyncShim(dir)
    for (const name of entries) {
      const abs = join(dir, name)
      if (isDir(abs)) {
        if (prefix === '') out.push(name + '/')
        out.push(...this.walk(abs, prefix === '' ? name + '/' : prefix + name + '/'))
      } else if (prefix !== '') {
        out.push(prefix + name)
      }
    }
    return out.sort()
  }
}

export function sha256Hex(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

// `readdirSync`/`statSync` 只在构造/列举期用：它们是同步元数据探测，与 FileDocRepository
// 的 exists/list 同口径（既有调用方依赖同步语义）。读文件内容仍是异步。
function readdirSyncShim(dir: string): string[] {
  try {
    return readdirSync(dir).sort()
  } catch {
    return []
  }
}

function isDir(abs: string): boolean {
  try {
    return statSync(abs).isDirectory()
  } catch {
    return false
  }
}
