/**
 * InstallSkills 用例（REQ-261005122347-e07a FR-1 / FR-5 / FR-6 / FR-8）。
 *
 * 干什么：把插件包里的 skill 资产**投放**到会话工作区的 `.dsh/skills/`，让原型子代理
 * 只读工作区路径就能用（子代理的文件/命令工具限工作区，读不到插件包内部——设计 architecture §2
 * 把"投放"定为主路径，不是可选优化）。
 *
 * 三条纪律：
 *  ① **幂等**：逐文件 sha256 全等 → `reused=true` 且一个字节都不写（mtime 不变）。
 *  ② **事务**：写盘交给 `SkillInstallPort.writeTree`（先临时目录、逐文件校验、再整体改名），
 *     本用例只在失败时把错误如实抛出去——半份资产比没有更坏。
 *  ③ **响亮**：解释器探测与开关状态都进回执。Python 缺失**不算失败**（照常投放），
 *     但主 agent 必须能从回执里看出"这机器检索不了"，不必自己再探一遍。
 *
 * @module dsh-pmboard/application/use-cases/InstallSkills
 */
import type { UseCaseDeps, PythonProbeResult, SkillWriteFile } from '../ports.js'
import { requirementStoreOf } from './queue-access.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import {
  buildManifest,
  parseProvenanceMarkdown,
  verifyManifest,
  type SkillFileFingerprint,
  type SkillManifestV1,
} from '../internal/skill-manifest.js'
import { normalizeText } from '../../shared/protocol.js'

/** 投放根在会话工作区下的固定相对位置（设计 architecture §2）。 */
export const SKILLS_ROOT_REL = '.dsh/skills'
/** 检索脚本相对投放根的路径（写进清单；绝对路径现算，不落盘）。 */
export const SEARCH_SCRIPT_REL = 'ui-ux-pro-max/scripts/search.py'

export interface InstallSkillsArgs {
  requirement_id?: string
  /** 只投放指定的 skill 名；缺省 = 全部。 */
  skills?: readonly string[]
  /** true = 忽略全等判定强制重写（排查资产损坏用）。 */
  force?: boolean
  /** 覆盖投放根（绝对路径）；缺省 = 配置 `skills.root`，再缺省 = 会话工作区下 `.dsh/skills`。 */
  root?: string
}

export interface InstallSkillsResult {
  success: true
  root: string
  /** 本次**真写**的 skill 名。 */
  materialized: readonly string[]
  /** true = 逐文件全等，什么都没写。 */
  reused: boolean
  bytes: number
  manifest: { commit: string; version: string; trimmed: readonly string[]; sha256Count: number }
  python: PythonProbeResult
  /** 检索脚本的**绝对**路径（子代理直接拿去跑）。 */
  searchScript: string
  note: string
}

/** 结构化失败（错误码进 `code`，文案里也带上——日志里能一眼看出是哪条）。 */
function reject(message: string, code: string): never {
  throw Object.assign(new Error(message + '（' + code + '）'), { code })
}

/** 拼接 POSIX 路径（application 层不引 `node:path`；root 一定是绝对路径）。 */
function joinPosix(root: string, rel: string): string {
  return root.endsWith('/') ? root + rel : root + '/' + rel
}

export async function executeInstallSkills(
  deps: UseCaseDeps,
  windowKey: string,
  args: InstallSkillsArgs = {},
): Promise<InstallSkillsResult> {
  const settings = deps.skillsSettings ?? { enabled: true }
  if (!settings.enabled) {
    reject('reqboard_skill_install 未执行：skills.enabled=false', 'REQBOARD_SKILLS_DISABLED')
  }

  const assets = deps.skillAssets
  const install = deps.skillInstall
  if (assets === undefined || install === undefined) {
    reject('reqboard_skill_install 未执行：未装配 skill 资产端口（插件装配缺失）', 'REQBOARD_SKILLS_ASSET_MISSING')
  }

  // 归属校验：显式给了 requirement_id 就必须是本窗口绑定的进行中需求（与既有工具同口径）。
  // 不给则**不做绑定要求**——投放是"把资产铺到会话工作区"，与需求推进无关；硬要绑定会让
  // 「还没立项就想先铺资产」这种正当用法被无谓挡掉（本用例的取舍，已记入完工记录）。
  const explicitId = normalizeText(args.requirement_id, 'requirement_id', 64)
  if (explicitId.length > 0) {
    const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)
    if (!bound.some(r => r.id === explicitId)) {
      reject('reqboard_skill_install 未执行：需求 ' + explicitId + ' 不是本窗口绑定的进行中需求', 'REQBOARD_NOT_BOUND_TO_WINDOW')
    }
  }

  // 溯源（FR-8）：缺 PROVENANCE 就是资产不完整，响亮拒绝——不静默投放一批"不知从哪来的"资产。
  const provenance = parseProvenanceMarkdown(await assets.readProvenance())

  const available = [...assets.listSkills()].sort()
  // 漏打包检测（TC-9）：PROVENANCE 登记的 skill 必须都在盘上。少了就是装机漏打，
  // 不是"这次少投一个"——必须响亮，否则用户拿到一份缺角的资产还不知道。
  const absent = provenance.skills.filter(s => !available.includes(s))
  if (absent.length > 0) {
    reject(
      '包内缺 skill 资产：' + absent.map(s => joinPosix(assets.rootDir(), s)).join(' / ') + '（装机漏打包？）',
      'REQBOARD_SKILLS_ASSET_MISSING',
    )
  }
  const wanted = args.skills === undefined || args.skills.length === 0 ? available : [...args.skills]
  for (const name of wanted) {
    if (!available.includes(name)) {
      reject(
        'reqboard_skill_install 未执行：未知 skill「' + name + '」，可用：' + available.join(' / '),
        'REQBOARD_SKILLS_UNKNOWN_SKILL',
      )
    }
  }
  const selected = [...new Set(wanted)].sort()

  // 读包内资产 → 待写清单（哈希在适配层算，与清单/校验同一口径）。
  const assetFiles: SkillWriteFile[] = []
  const fingerprints: Record<string, SkillFileFingerprint> = {}
  for (const skill of selected) {
    for (const rel of assets.listFiles(skill)) {
      const asset = await assets.readAsset(rel)
      fingerprints[rel] = { sha256: asset.sha256, bytes: asset.content.byteLength }
      assetFiles.push({ rel, content: asset.content, sha256: asset.sha256 })
    }
  }
  if (assetFiles.length === 0) {
    reject(
      'reqboard_skill_install 未执行：包内没有可投放的资产文件（缺 ' + selected.join(' / ') + '？）',
      'REQBOARD_SKILLS_ASSET_MISSING',
    )
  }

  const root = (args.root ?? settings.root ?? deps.docs.resolve(SKILLS_ROOT_REL)).trim()
  const meta = deps.pluginMeta ?? { name: 'dsh-pmboard', version: 'unknown' }
  const manifest: SkillManifestV1 = buildManifest({
    plugin: { name: meta.name, version: meta.version, build: meta.build ?? 'unstamped' },
    source: { commit: provenance.commit, license: provenance.license },
    materializedAt: deps.clock.now(),
    root,
    files: fingerprints,
    trimmed: provenance.trimmed.map(t => t.glob),
    searchScript: SEARCH_SCRIPT_REL,
  })

  // 幂等判定：盘上资产树与既有清单逐项全等 → 不写。
  const existingTree = await install.readTree(root)
  const existingManifest = parseManifest(await install.readManifest(root))
  const reused = args.force !== true && verifyManifest(existingTree, existingManifest).length === 0

  const probe = await install.probePython()
  const searchScript = joinPosix(root, SEARCH_SCRIPT_REL)

  if (reused) {
    return {
      success: true,
      root,
      materialized: [],
      reused: true,
      bytes: sumBytes(existingTree),
      manifest: manifestDigest(manifest),
      python: probe,
      searchScript,
      note: '资产与清单逐文件一致，本次未写盘（幂等跳过）；如怀疑内容损坏可加 force=true 重写',
    }
  }

  const receipt = await install.writeTree(root, [
    ...assetFiles,
    // 自忽略：投放根是插件自己的受管目录，不污染用户 git 状态（也不改用户既有 .gitignore）。
    { rel: '.gitignore', content: new TextEncoder().encode('*\n') },
    { rel: '.manifest.json', content: new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n') },
  ])

  return {
    success: true,
    root,
    materialized: selected,
    reused: false,
    bytes: receipt.bytes,
    manifest: manifestDigest(manifest),
    python: probe,
    searchScript,
    note: '已投放 skill 资产并写 .manifest.json / .gitignore(*)；该目录为过程资产，rm -rf 即完全回滚',
  }
}

/** 回执里的清单摘要（只给人看的几个数，不搬整份指纹表）。 */
function manifestDigest(manifest: SkillManifestV1): InstallSkillsResult['manifest'] {
  return {
    commit: manifest.source.commit,
    version: manifest.plugin.version,
    trimmed: manifest.trimmed,
    sha256Count: Object.keys(manifest.files).length,
  }
}

function sumBytes(tree: Readonly<Record<string, SkillFileFingerprint>>): number {
  let total = 0
  for (const rel of Object.keys(tree)) total += tree[rel]!.bytes
  return total
}

/** 解析既有 `.manifest.json`；缺失/坏 JSON → undefined（= 视为未投放，走重写）。 */
function parseManifest(raw: string | undefined): SkillManifestV1 | undefined {
  if (raw === undefined) return undefined
  try {
    const parsed = JSON.parse(raw) as SkillManifestV1
    if (parsed === null || typeof parsed !== 'object') return undefined
    return parsed
  } catch {
    return undefined
  }
}
