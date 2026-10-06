/**
 * skill 资产清单契约（REQ-261005122347-e07a FR-2 / FR-8 / 设计 data-model §1、§2）。
 *
 * 为什么单独一个**纯函数**模块：清单是跨盘的比对凭据（包内 `PROVENANCE.md` ↔ 投放目录
 * `.manifest.json`），一旦掺进 I/O，红的时候就再也分不清"内容被改了"还是"根本没读到盘"——
 * 而那正是本需求要防的静默漂移。所以这里只做**形状构造**与**逐项比对**，读盘/写盘/算哈希
 * 一律留给适配层（`adapters/SkillAssets`、`adapters/SkillWriter`）。
 *
 * 纪律：零 I/O、零 `node:` import（`tests/layer-boundary.test.ts` 守着 application 层）。
 *
 * @module dsh-pmboard/application/internal/skill-manifest
 */

/** 投放清单的当前版本。形态变更即 +1，并在投放侧写迁移（设计 data-model §2）。 */
export const SKILL_MANIFEST_SCHEMA = 1

/** 包内 `skills/PROVENANCE.md` front-matter 的机器可读形状（设计 data-model §1）。 */
export interface SkillProvenanceV1 {
  readonly source: string
  readonly license: string
  readonly commit: string
  readonly fetchedAt: string
  /** 收录的 skill 名（排序后），必须与 `<pkg>/skills` 一级目录双向一致。 */
  readonly skills: readonly string[]
  readonly trimmed: readonly SkillTrimRule[]
  /** 相对 `<pkg>/skills` 的 POSIX 路径 → sha256 hex。 */
  readonly sha256: Readonly<Record<string, string>>
}

/** 一条裁剪规则（记 glob、真实剔除字节数与理由——理由要能被人否决）。 */
export interface SkillTrimRule {
  readonly glob: string
  readonly bytes: number
  readonly why: string
}

/** 单文件指纹（包内校验与投放清单共用同一形状）。 */
export interface SkillFileFingerprint {
  readonly sha256: string
  readonly bytes: number
}

/** 投放目录里的 `.manifest.json`（设计 data-model §2）。 */
export interface SkillManifestV1 {
  readonly schema: typeof SKILL_MANIFEST_SCHEMA
  readonly plugin: { readonly name: string; readonly version: string; readonly build: string }
  readonly source: { readonly commit: string; readonly license: string }
  readonly materializedAt: number
  readonly root: string
  /** 相对投放根的 POSIX 路径 → 指纹。幂等判据：全等 → `reused=true` 不重写。 */
  readonly files: Readonly<Record<string, SkillFileFingerprint>>
  /** 裁剪清单（glob 字符串即可；字节数在包内 PROVENANCE 里）。 */
  readonly trimmed: readonly string[]
  /** **相对 root** 的检索脚本路径；绝对路径由工具回执现算，不落盘（防目录搬家后失效）。 */
  readonly searchScript: string
}

export interface BuildManifestInput {
  readonly plugin: { name: string; version: string; build: string }
  readonly source: { commit: string; license: string }
  readonly materializedAt: number
  readonly root: string
  readonly files: Readonly<Record<string, SkillFileFingerprint>>
  readonly trimmed: readonly string[]
  readonly searchScript: string
}

/** 构造投放清单：只做形状规整（键排序），不做任何 I/O 与判定。 */
export function buildManifest(input: BuildManifestInput): SkillManifestV1 {
  const files: Record<string, SkillFileFingerprint> = {}
  for (const rel of Object.keys(input.files).sort()) {
    const f = input.files[rel]!
    files[rel] = { sha256: f.sha256.toLowerCase(), bytes: f.bytes }
  }
  return {
    schema: SKILL_MANIFEST_SCHEMA,
    plugin: { ...input.plugin },
    source: { ...input.source },
    materializedAt: input.materializedAt,
    root: input.root,
    files,
    trimmed: [...input.trimmed].sort(),
    searchScript: input.searchScript,
  }
}

/** sha256 的合法形状（64 位小写 hex）——不合法的清单视为不可信凭据。 */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

/** 一条不一致。`rel` 用 `<manifest>` 表示清单自身层面的问题。 */
export interface SkillManifestMismatch {
  readonly rel: string
  readonly kind: SkillManifestMismatchKind
  readonly expected?: string | number
  readonly actual?: string | number
}

export type SkillManifestMismatchKind =
  /** `.manifest.json` 不存在 → 视为未投放。 */
  | 'manifest-missing'
  /** schema 不是当前版本，或形状（sha256/bytes）不可信 → 视为未投放，整目录重建。 */
  | 'schema-unsupported'
  /** 清单登记了、盘上没有。 */
  | 'file-missing'
  /** 盘上有、清单没登记（用户新增或上次投放残留）。 */
  | 'file-extra'
  /** 内容或字节数对不上——**这就是"手改投放目录里一个文件"要红的那条**。 */
  | 'content-mismatch'

/**
 * 逐项比对盘上指纹与清单（设计 data-model §4 断言 ②）。
 *
 * 返回**全部**不一致（排序后），不是遇到第一条就返回：只报一条会让"改了三处"看起来像"改了一处"。
 * 清单缺失/形状不可信时返回单条 `manifest-missing` / `schema-unsupported`——调用方据此走"整目录重建"，
 * 而不是把这种状态当成"内容不一致"去逐文件覆盖（那会漏掉用户新增的文件）。
 */
export function verifyManifest(
  actual: Readonly<Record<string, SkillFileFingerprint>>,
  manifest: SkillManifestV1 | undefined | null,
): readonly SkillManifestMismatch[] {
  if (manifest === undefined || manifest === null) {
    return [{ rel: '<manifest>', kind: 'manifest-missing' }]
  }
  if (manifest.schema !== SKILL_MANIFEST_SCHEMA || !manifestShapeTrustworthy(manifest)) {
    return [{ rel: '<manifest>', kind: 'schema-unsupported', actual: String(manifest.schema) }]
  }

  const out: SkillManifestMismatch[] = []
  for (const rel of Object.keys(manifest.files).sort()) {
    const expected = manifest.files[rel]!
    const got = actual[rel]
    if (got === undefined) {
      out.push({ rel, kind: 'file-missing', expected: expected.sha256, actual: undefined })
      continue
    }
    if (got.bytes !== expected.bytes || got.sha256.toLowerCase() !== expected.sha256.toLowerCase()) {
      out.push({
        rel,
        kind: 'content-mismatch',
        expected: expected.sha256,
        actual: got.sha256,
      })
    }
  }
  for (const rel of Object.keys(actual).sort()) {
    if (manifest.files[rel] === undefined) out.push({ rel, kind: 'file-extra' })
  }
  return out
}

/** 这些不一致是否只意味着"当作未投放、整目录重建"（而非内容被篡改）。 */
export function manifestNeedsRebuild(mismatches: readonly SkillManifestMismatch[]): boolean {
  return mismatches.length === 1
    && (mismatches[0]!.kind === 'manifest-missing' || mismatches[0]!.kind === 'schema-unsupported')
}

function manifestShapeTrustworthy(manifest: SkillManifestV1): boolean {
  if (typeof manifest.searchScript !== 'string' || typeof manifest.root !== 'string') return false
  if (!manifest.files || typeof manifest.files !== 'object') return false
  for (const rel of Object.keys(manifest.files)) {
    const f = manifest.files[rel]!
    if (!f || !isSha256Hex(f.sha256) || typeof f.bytes !== 'number' || !Number.isFinite(f.bytes)) return false
  }
  return true
}

/**
 * 解析 `skills/PROVENANCE.md` 的 YAML front-matter（设计 data-model §1）。
 *
 * 为什么自己写而不引 YAML 库：格式是**本需求自己定的**（只有标量、标量列表、map 列表、
 * 路径→hex 映射四种形状），引一个通用解析器反而把"格式漂移"从"测试红"变成"静默容忍更多写法"。
 * 少了半个字段（例如 `sha256` 整段丢了）时这里**抛错**，而不是返回空表让校验静默通过。
 */
export function parseProvenanceMarkdown(text: string): SkillProvenanceV1 {
  const lines = text.split(/\r?\n/)
  if (lines.length === 0 || lines[0]!.trim() !== '---') throw new Error('PROVENANCE.md 缺少 front-matter 起始行（---）')
  const front: string[] = []
  let closed = false
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') { closed = true; break }
    front.push(lines[i]!)
  }
  if (!closed) throw new Error('PROVENANCE.md front-matter 未闭合（缺结束的 ---）')

  const scalars: Record<string, string> = {}
  const scalarLists: Record<string, string[]> = {}
  const rawTrim: Record<string, string>[] = []
  const sha256: Record<string, string> = {}
  let section: string | undefined
  let currentRule: Record<string, string> | undefined

  for (const raw of front) {
    const line = raw.replace(/\s+$/, '')
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue

    const listItem = /^\s+-\s*(.*)$/.exec(line)
    if (listItem !== null) {
      const rest = listItem[1]!.trim()
      const kv = splitKeyValue(rest)
      if (kv !== undefined && section === 'trimmed') {
        currentRule = { [kv[0]]: unquote(kv[1]) }
        rawTrim.push(currentRule)
      } else if (section !== undefined) {
        ;(scalarLists[section] ??= []).push(unquote(rest))
      }
      continue
    }

    const nested = /^\s{2,}([^:\s][^:]*):\s*(.*)$/.exec(line)
    if (nested !== null) {
      const key = nested[1]!.trim()
      const value = unquote(nested[2]!.trim())
      if (section === 'trimmed' && currentRule !== undefined) currentRule[key] = value
      else if (section === 'sha256') sha256[key] = value
      continue
    }

    const top = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (top !== null) {
      section = top[1]!
      currentRule = undefined
      const value = top[2]!.trim()
      if (value.length > 0) scalars[section] = unquote(value)
      continue
    }
  }

  const require = (key: string): string => {
    const v = scalars[key]
    if (v === undefined || v.length === 0) throw new Error('PROVENANCE.md 缺少字段：' + key)
    return v
  }
  const skills = (scalarLists['skills'] ?? []).filter(s => s.length > 0)
  if (skills.length === 0) throw new Error('PROVENANCE.md 的 skills 列表为空')
  if (Object.keys(sha256).length === 0) throw new Error('PROVENANCE.md 的 sha256 映射为空（指纹缺失即校验失效）')

  const trimmed: SkillTrimRule[] = rawTrim.map((r) => {
    const bytes = Number(r['bytes'])
    if (!Number.isFinite(bytes)) throw new Error('PROVENANCE.md 的 trimmed.bytes 不是数字：' + String(r['bytes']))
    return { glob: r['glob'] ?? '', bytes, why: r['why'] ?? '' }
  })

  return {
    source: require('source'),
    license: require('license'),
    commit: require('commit'),
    fetchedAt: require('fetchedAt'),
    skills,
    trimmed,
    sha256,
  }
}

function splitKeyValue(text: string): [string, string] | undefined {
  const idx = text.indexOf(':')
  if (idx <= 0) return undefined
  const key = text.slice(0, idx).trim()
  if (key.length === 0 || /\s/.test(key)) return undefined
  return [key, text.slice(idx + 1).trim()]
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1)
  }
  return value
}

/**
 * 包内 PROVENANCE 指纹校验（设计 data-model §4 断言 ①）：内容被手改 → 非空不一致清单。
 *
 * 只比对 `sha256` 表里登记过的路径 + 检出登记路径的缺失；**不**负责枚举目录
 * （枚举是适配层的活，见 `adapters/SkillAssets`）。
 */
export function verifyProvenance(
  digests: Readonly<Record<string, SkillFileFingerprint>>,
  provenance: SkillProvenanceV1 | undefined | null,
): readonly SkillManifestMismatch[] {
  if (provenance === undefined || provenance === null) return [{ rel: '<manifest>', kind: 'manifest-missing' }]
  const out: SkillManifestMismatch[] = []
  for (const rel of Object.keys(provenance.sha256).sort()) {
    const expected = provenance.sha256[rel]!
    const actual = digests[rel]
    if (!isSha256Hex(expected)) {
      out.push({ rel, kind: 'schema-unsupported', actual: expected })
      continue
    }
    if (actual === undefined) {
      out.push({ rel, kind: 'file-missing', expected })
      continue
    }
    if (actual.sha256.toLowerCase() !== expected.toLowerCase()) {
      out.push({ rel, kind: 'content-mismatch', expected, actual: actual.sha256 })
    }
  }
  return out
}
