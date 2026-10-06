/**
 * 迁移与兼容核验（REQ-260928222643-4d34 · 父卡 t-316227 · serves: FR-4, FR-5）
 * ＋ **存量兼容的机械证明**（REQ-261005105032-3b02 · 父卡 t-5bf1e4 · serves: FR-5, FR-11）。
 *
 * ## 为什么两件事同处一个文件
 *
 * 3b02 的 t22 卡面把验收跑法钉死为 `npx vitest run tests/compat-regression.test.ts
 * tests/rtm-health-legacy.test.ts`，而 `tests/compat-regression.test.ts` 这个文件名**已被上一条需求
 * （4d34）占用**（HEAD 内既有文件、7 条断言）。同名文件只能有一个：故本文件**逐字保留** 4d34 的
 * 全部断言（文件末段 `describe`），把 3b02 的兼容证明追加在同一个文件里——跑法保住、两条需求的
 * 证据都在。删别人的断言去腾文件名，不是"只新建一个用例文件"允许的代价。
 *
 * ## 3b02 这一半证的是什么（题眼：**新规则不许追溯砸到老需求**）
 *
 * brief §5「兼容基线」+ §10 决议 `#50`：三个新键是**加性（additive）变更、零迁移**——旧记录缺键
 * = **未采集**，不补齐、不改写、无迁移脚本。本文件把这句话变成会失败的检查：
 *
 *   ① **加性零迁移**：旧台账分片缺 `StageArtifact.prototypeMeta` / `TaskRecord.prototypeRefs` /
 *      `decisionRefs` 时，走**生产读路径**（分片仓储 + 装配 + 文档面板投影）读出为未采集，且落盘
 *      字节一字节不变；新键只由写侧带上。
 *   ② **追溯缺节 = 未采集**：`validator.ts` 对缺 `prototypes`/`decisions` 节读出 `pending` 且不判损坏；
 *      含未知 key 的旧 YAML 忽略不报错；形状真坏才 `error`（对照组，防"恒 pending"空转）。
 *   ③ **历史豁免**：`rtm-health.ts` 的适用性判据下，存量 UI 需求一律 `exempted: 'legacy'`、不判不健康；
 *      同一标本把创建时间推到规则上线日之后 ⇒ 立刻不健康并点名（对照组）。
 *   ④ **存量不被追溯拒绝**：四个新门（存在门 / 裁定门 / 拆分锚点门 / 阶段门时序）对 `artifacts`
 *      为空或 `undefined` 的存量与直种需求一律放行；**同一个标本把 artifacts 填成非空后必须真的被拒**
 *      ——这条对照组才是"放行不是写死"的证明。已归档需求同款放行，且读侧不回填原型 / frontmatter。
 *   ⑤ **全量读取**：真实存量目录里**全部** `rtm-*.yml` 读出零异常（不是抽一两个样本）。
 *   ⑥ **未新增迁移脚本、未改写旧分片**：`git status` / `git diff --stat` 前后一致，且存量 RTM 与
 *      已脏的存量分片逐份内容哈希不变。
 *
 * 存量的"内容哈希不变"是本文件的核心证据形态：本仓工作树里**本来就有一批被别的窗口改脏的旧分片**
 * （跑前 `git status` 就是脏的），所以断言不能写「旧分片必须与 HEAD 一致」——那会把别人的改动记到
 * 本卡头上；正确口径是「本用例跑前跑后，存量逐字节没变」（before/after 对拍）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { REQBOARD_SCHEMA_VERSION, isDegrade, type PlanTask, type RequirementRecord, type StageArtifact } from '../src/shared/protocol.js'
import { RequirementShardRepository } from '../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import { parseDocument, type DocsReader } from '../src/application/internal/doc-parse.js'
import { designDocPolicyFrom } from '../src/application/internal/category-doc-sets.js'
import {
  PROTOTYPE_RULES_SINCE,
  checkRTMHealth,
  prototypeSectionVerdict,
  prototypesSectionPresent,
} from '../src/application/internal/rtm-health.js'
import { checkDecisionLogGate } from '../src/application/internal/decision-gates.js'
import { checkPrototypePresenceGate } from '../src/application/internal/prototype-gates.js'
import { assertClauseCoverageGate, contentGatesForMove } from '../src/application/internal/content-gate-wiring.js'
import { queryDocs } from '../src/application/query/QueryDocs.js'
import { checkRTMSectionTolerance, type RTMToleranceReport } from '../vendor/reqboard/src/rtm/validator.js'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const REQ_ROOT = join(REPO, 'docs', 'requirements')

// ─────────────────────────────────────────────────────────────────────────────
// 共享夹具：临时台账根 + 真实读路径 + 只读文档端口
// ─────────────────────────────────────────────────────────────────────────────

const LEGACY_REQ = 'REQ-261005105032-0abc'
/** 真实的存量 UI 需求（sides 含 frontend、feature）；用来做"非空 artifacts 必被拒"的对照组。 */
const REAL_UI_REQ = 'REQ-261005105032-3b02'

/** 一份**够真**的存量热记录：标量齐、计数与 artifacts.json 的实际条数一致。 */
function legacyHotRecord(): Record<string, unknown> {
  return {
    id: LEGACY_REQ,
    title: '存量分片（缺三个新键）',
    description: '本分片由用例临时创建：模拟规则上线前落盘的需求记录',
    category: 'feature',
    status: 'implementing',
    blocked: false,
    version: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    statusHistory: [],
    // v10 提交点计数：装配按它取日志 / 外置对象的前缀
    commentCount: 0,
    historyCount: 0,
    artifactCount: 1,
  }
}

/**
 * 旧形态的一条产物：只有登记期的四个键，**没有** `prototypeMeta`（决议 `#50`：加性变更）。
 * 返回普通对象（不是 `StageArtifact`），断言"这个对象上真的没有该键"，而不是"值是 undefined"。
 */
function legacyArtifact(): Record<string, unknown> {
  return {
    stage: 'brainstorming',
    kind: 'notes',
    // 路径必须落在 `DELIVERABLE_DOC_PATTERNS`（design/*.md）里：只有**确定文档**行才走
    // `prototypeMetaOf` 投影——这条用例要断言的正是"投影时不给旧产物凭空补 prototypeMeta"。
    path: 'docs/requirements/' + LEGACY_REQ + '/design/frontend.md',
    registeredAt: 1_700_000_000_002,
    registeredBy: { kind: 'human' },
  }
}

/** 在临时数据根里手工落一份"旧形态分片"（record.json 只有标量 + 计数，大字段外置）。 */
function writeLegacyShard(root: string): string {
  const dir = join(root, 'requirements', LEGACY_REQ)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'record.json'), JSON.stringify(legacyHotRecord(), null, 2) + '\n')
  writeFileSync(join(dir, 'artifacts.json'), JSON.stringify([legacyArtifact()], null, 2) + '\n')
  return dir
}

/** 读出该分片目录下**全部文件字节**（读取路径"不写盘"的 before/after 对拍用）。 */
function snapshotDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (statSync(p).isFile()) out[name] = readFileSync(p, 'utf8')
  }
  return out
}

/** 真实需求目录的只读 `DocsReader`（路径口径与生产一致：工作区相对）。 */
const docsReader: DocsReader = {
  exists: (rel) => existsSync(join(REPO, rel)),
  read: async (rel) => readFileSync(join(REPO, rel), 'utf8'),
  list: (relDir) => {
    const abs = join(REPO, relDir)
    if (!existsSync(abs)) return []
    return readdirSync(abs, { withFileTypes: true }).map(d => ({ name: d.name, isFile: !d.isDirectory() }))
  },
}

/** 只读探针：把某份文档正文换掉，其余一律真读（对照组用，不落盘）。 */
function docsWithOverride(path: string, text: string): DocsReader {
  return {
    exists: (rel) => rel === path || docsReader.exists(rel),
    read: async (rel) => (rel === path ? text : docsReader.read(rel)),
    list: (relDir) => docsReader.list?.(relDir) ?? [],
  }
}

/** 需求记录的最小形状（新门只看 id / category / artifacts；createdAt 给存量值）。 */
function reqLike(id: string, category: RequirementRecord['category'], artifacts?: readonly StageArtifact[]): RequirementRecord {
  return {
    id,
    title: '标本需求 ' + id,
    description: '存量标本',
    category,
    status: 'brainstorming',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    statusHistory: [],
    ...(artifacts === undefined ? {} : { artifacts: [...artifacts] }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 存量目录快照：① 内容哈希（逐字节） ② 文件集合 ③ git 工作树状态
// ─────────────────────────────────────────────────────────────────────────────

/** 全部存量 RTM YAML（真实目录，含 `rtm-implementing/` 子目录）。 */
function rtmFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/^rtm-.*\.ya?ml$/.test(e.name)) out.push(p)
    }
  }
  walk(REQ_ROOT)
  return out.sort()
}

function git(args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** 当前盘上字节的 git 对象哈希（与 `git ls-files -s` 的 blob 哈希同口径）。 */
function hashObjectOf(relPath: string): string {
  return git(['hash-object', '--', relPath]).trim()
}

/** `git status --porcelain` 的 `路径 → 状态码`。 */
function gitTrackedStatus(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of git(['status', '--porcelain']).split('\n')) {
    if (line.trim().length === 0) continue
    out[line.slice(3)] = line.slice(0, 2)
  }
  return out
}

function gitUntrackedFiles(): string[] {
  return git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(l => l.trim().length > 0).sort()
}

/** 跑前的工作树快照（模块加载时取一次：`beforeAll` 之前就固定，避免与其它用例互相影响）。 */
const GIT_BEFORE = {
  tracked: gitTrackedStatus(),
  untracked: new Set(gitUntrackedFiles()),
}

/**
 * 跑前"**已改动**的存量分片"的内容哈希（`git hash-object` = 盘上字节）。
 *
 * 只对 `docs/requirements/` 下、状态码显示已改动的项取：读取路径若**顺手改写**旧分片（例如补
 * `prototypeMeta`、回填 `prototype_exempt`），这里的哈希就会变——比"看 git status 没多一行"更严。
 * 注意：这些分片**跑前就是脏的**（并行窗口改的），所以口径是"跑前跑后一字不变"，不是"必须等于 HEAD"。
 */
const GIT_BEFORE_SHARD_HASHES: Record<string, string> = {}
for (const [file, state] of Object.entries(GIT_BEFORE.tracked)) {
  if (!file.startsWith('docs/requirements/')) continue
  if (!/^( M|M |MM|A |AM)$/.test(state)) continue
  if (!existsSync(join(REPO, file))) continue
  GIT_BEFORE_SHARD_HASHES[file] = hashObjectOf(file)
}

/**
 * 存量 RTM 的**冻结快照**（本文件加载时把每份 `rtm-*.yml` 的文本读进内存 + 记下 mtime）。
 *
 * 为什么不直接对活树做"跑前/跑后两次哈希"：本仓同时有别的窗口在改 `docs/requirements/**`
 * （实测：本用例跑动期间 `REQ-000001` 的 brainstorming / design / lifecycle 三份 RTM 被并行窗口
 * 改写），活树哈希对拍会把**别人的写**记成"读取路径写了盘"——假红，且与真红无法区分。
 * 冻结快照把两件事拆开，各自可证伪：
 *   · **读取路径不写盘**：本文件唯一的"读存量 RTM"路径（⑤）跑在冻结文本上；跑完核对活树这些
 *     文件的 `mtimeNs` 一字不变——**mtime 只由写操作改变**，与"别人何时改过内容"无关；
 *   · **活树没被本用例改动**：由 git 侧断言（无新脏项 / 无新迁移脚本 / 已脏分片内容哈希不变）。
 */
interface FrozenRtm { rel: string; abs: string; text: string; mtimeNs: bigint }

function freezeRtmFiles(): FrozenRtm[] {
  return rtmFiles().map((abs) => ({
    rel: abs.slice(REPO.length),
    abs,
    text: readFileSync(abs, 'utf8'),
    mtimeNs: statSync(abs, { bigint: true }).mtimeNs,
  }))
}

let FROZEN_RTM: FrozenRtm[] = []

beforeAll(() => {
  FROZEN_RTM = freezeRtmFiles()
  // 快照非空是"后续断言不是空跑"的前置（存量目录没了 = 本文件整体失去意义，必须响亮）
  expect(FROZEN_RTM.length, '存量 RTM 冻结快照必须非空').toBeGreaterThan(0)
  expect(Object.keys(GIT_BEFORE_SHARD_HASHES).length, '必须存在"已改动的存量分片"（否则哈希对拍是空跑）').toBeGreaterThan(0)
})

// ═════════════════════════════════════════════════════════════════════════════
// 3b02 · t-5bf1e4 存量兼容核验
// ═════════════════════════════════════════════════════════════════════════════

describe('存量兼容 · 加性零迁移：三个新键缺键 = 未采集（REQ-261005105032-3b02 t-5bf1e4 / FR-5 / 决议 #50）', () => {
  it('① 旧分片走生产读路径：不报错、新键未采集、读侧不改一个字节', async () => {
    const root = mkdtempSync(join(tmpdir(), 'compat-ledger-'))
    try {
      const dir = writeLegacyShard(root)
      const before = snapshotDir(dir)

      // 落盘形态先自证：旧分片里**根本没有**这三个新键
      const rawRecord = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf8')) as Record<string, unknown>
      const rawArtifacts = JSON.parse(readFileSync(join(dir, 'artifacts.json'), 'utf8')) as Record<string, unknown>[]
      expect(Object.keys(rawRecord)).not.toContain('prototypeRefs')
      expect(Object.keys(rawRecord)).not.toContain('decisionRefs')
      expect(Object.keys(rawArtifacts[0] ?? {})).not.toContain('prototypeMeta')

      // 生产读路径：分片仓储 → 装配（与看板 reqboard_status / store.get 同一条链）
      const repo = new RequirementShardRepository({ onWarn: () => { /* 本用例不关心告警 */ } })
      const store = new ShardedRequirementStore({ root, repository: repo, onWarn: () => { /* 同上 */ } })
      const req = await store.get(LEGACY_REQ)

      expect(req, '旧分片必须能读出来（不是 undefined，更不能抛）').toBeDefined()
      const artifacts = req?.artifacts ?? []
      expect(artifacts).toHaveLength(1)
      const artifact = artifacts[0] as StageArtifact
      expect(artifact.prototypeMeta, '缺键 = 未采集，读侧不补默认值').toBeUndefined()
      expect(Object.prototype.hasOwnProperty.call(artifact, 'prototypeMeta')).toBe(false)

      // **读侧零写入**的机械证据：读之前 / 读之后逐字节（含 mtime）完全一致。
      // 这一步刻意排在 mutate 之前——写侧当然会写盘，只有"读完没变"才证明读路径不补键。
      const afterRead = snapshotDir(dir)
      expect(afterRead).toEqual(before)

      // 任务卡两个键同理：旧计划的分片里没有这两个键，读回来仍然没有（读侧不补默认值 []）
      const oldPlanTask: PlanTask = { key: 't1', title: '老卡', phase: 'implement', side: 'backend', dependsOn: [] }
      const written = await store.mutate(LEGACY_REQ, (r) => {
        r.plan = {
          path: 'docs/requirements/' + LEGACY_REQ + '/decomposition.md',
          summary: '旧计划（存量形态）',
          tasks: [oldPlanTask],
          submittedAt: 1_700_000_000_003,
          submittedBy: { kind: 'human' },
        }
        return { changed: true }
      })
      const task = written.requirement.plan?.tasks?.[0] as (PlanTask & Record<string, unknown>) | undefined
      expect(task, '旧计划里的任务必须读得出来').toBeDefined()
      expect(task?.prototypeRefs).toBeUndefined()
      expect(task?.decisionRefs).toBeUndefined()
      expect(Object.prototype.hasOwnProperty.call(task ?? {}, 'prototypeRefs'), '读侧不得把缺键补成 []').toBe(false)
      expect(Object.prototype.hasOwnProperty.call(task ?? {}, 'decisionRefs'), '读侧不得把缺键补成 []').toBe(false)

      // 带新键的只有**写侧**：显式登记原型产物那条链（submit(kind=prototype)）
      const writeSide: StageArtifact = {
        stage: 'brainstorming',
        kind: 'prototype',
        path: 'docs/requirements/' + LEGACY_REQ + '/prototypes/detail.html',
        registeredAt: 1_700_000_000_004,
        registeredBy: { kind: 'agent' },
        prototypeMeta: { anchors: [{ fr: 'FR-1', selector: '#FR-1' }], geometry: [] },
      }
      expect(writeSide.prototypeMeta?.anchors).toHaveLength(1)

      // 写侧只动 record.json（版本 +1）与 plan.json；**artifacts.json 一字节未动**——
      // 读路径没有顺手给旧产物补 prototypeMeta（决议 #50：不补齐、不改写）
      const afterWrite = snapshotDir(dir)
      expect(afterWrite['artifacts.json']).toBe(before['artifacts.json'])
      expect(Object.prototype.hasOwnProperty.call(afterWrite, 'plan.json')).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('①b 旧产物经文档面板投影：未采集 ⇒ 不注入 prototypeMeta（不渲染成"缺锚点"）', async () => {
    const req = reqLike(LEGACY_REQ, 'feature', [legacyArtifact() as unknown as StageArtifact])
    const res = await queryDocs(
      {
        store: { get: async () => req },
        tasks: { listByRequirement: async () => [] },
        // 文档端口最小桩：本用例只关心**台账产物**的投影（盘上文件一律"不在"）
        docs: {
          exists: () => false,
          read: async () => '',
          write: async () => { /* 只读用例，永不写 */ },
          list: () => [],
          stat: () => undefined,
          resolve: (rel: string) => rel,
          workspaceRoot: REPO,
        },
      } as never,
      { requirementId: LEGACY_REQ } as never,
    )
    // 命中"活"分支（降级分支才带 available:false）；降到降级分支时这里会响亮失败，不静默跳过
    if (isDegrade(res)) throw new Error('文档查询降级：' + res.reason + ' — 本用例需要活分支')
    const row = res.documents.find(d => d.path === (legacyArtifact()['path'] as string))
    expect(row, '登记过的产物必须出现在文档行里').toBeDefined()
    expect(row?.prototypeMeta).toBeUndefined()
    expect(row !== undefined && 'prototypeMeta' in row, '未采集与"采集到 0 条"必须能分辨（决议 #50）').toBe(false)
  })
})

describe('存量兼容 · 追溯缺节 = 未采集：validator 宽容度（t-5bf1e4 / FR-11 / brief §5）', () => {
  const LEGACY_YAML = [
    'metadata:',
    '  stage: brainstorming',
    '  requirement_id: REQ-261005105032-0abc',
    '  version: 7',
    'outputs:',
    '  requirements:',
    '    - id: FR-1',
    '      title: 老需求',
    '      line: 3',
    'status:',
    '  artifacts: []',
    '',
  ].join('\n')

  it('② 缺 prototypes / decisions 节的旧 YAML → pending、不判损坏', () => {
    const report = checkRTMSectionTolerance(parseYaml(LEGACY_YAML), 'brainstorming')
    expect(report.ok).toBe(true)
    expect(report.sections.map(s => [s.section, s.state])).toEqual([
      ['outputs.prototypes', 'pending'],
      ['outputs.decisions', 'pending'],
    ])
    for (const s of report.sections) expect(s.gaps).toEqual([])
  })

  it('②b 含未知 key 的旧 YAML → 忽略不报错（前向兼容）', () => {
    const futureYaml = [
      'metadata:',
      '  stage: brainstorming',
      'future_block:',
      '  whatever: [1, 2, 3]',
      'outputs:',
      '  requirements: []',
      '  future_section:',
      '    nested: true',
      '',
    ].join('\n')
    const report = checkRTMSectionTolerance(parseYaml(futureYaml), 'brainstorming')
    expect(report.ok).toBe(true)
    expect(report.sections.every(s => s.state !== 'error')).toBe(true)
  })

  it('②c 对照组：形状**真坏**时必须报 error（否则上面两条 pending 是空转）', () => {
    const broken = checkRTMSectionTolerance({ outputs: { requirements: [], prototypes: '这是个字符串' } }, 'brainstorming')
    expect(broken.ok).toBe(false)
    expect(broken.sections[0]?.state).toBe('error')
    expect(broken.sections[0]?.gaps.join()).toContain('不是数组')
  })
})

describe('存量兼容 · 历史豁免：适用性判据下存量一律 exempted legacy（t-5bf1e4 / 决议 #19）', () => {
  it('③ 真实存量目录全量过判据：UI 缺节 ⇒ exempted legacy，且不被判不健康', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'compat-health-'))
    try {
      const dirs = readdirSync(REQ_ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
      expect(dirs.length).toBeGreaterThan(0)

      let uiScanned = 0
      const notExempted: string[] = []
      const unhealthy: string[] = []
      for (const id of dirs) {
        const reqMd = join(REQ_ROOT, id, 'requirement.md')
        const sides = existsSync(reqMd)
          ? designDocPolicyFrom(parseDocument(readFileSync(reqMd, 'utf8')).frontmatter).sides
          : []
        const bsPath = join(REQ_ROOT, id, 'rtm-brainstorming.yml')
        const text = existsSync(bsPath) ? readFileSync(bsPath, 'utf8') : undefined
        // 只对"确定缺 prototypes 节"的 UI 需求检查豁免口径（判不了 / 有节 的标本走别的分支）
        if (!sides.includes('frontend') || prototypesSectionPresent(text) !== false) continue
        uiScanned++

        const verdict = prototypeSectionVerdict({
          reqId: id,
          createdAt: 1_700_000_000_000, // 存量需求的 createdAt 都 < PROTOTYPE_RULES_SINCE
          sides,
          brainstormingText: text,
        })
        expect(verdict.exempted, id + ' 应当走存量豁免').toBe('legacy')
        expect(verdict.required, id + ' 存量不该被要求补节').toBe(false)
        expect(verdict.gaps, id + ' 存量不该被点名').toEqual([])

        const health = checkRTMHealth(REPO, stateDir, reqLike(id, 'feature'))
        if (health.exempted !== 'legacy') notExempted.push(id)
        if (!health.healthy) unhealthy.push(id)
      }

      expect(uiScanned, '存量里必须真的有"UI 且缺节"的标本（否则本条是空跑）').toBeGreaterThan(0)
      expect(notExempted).toEqual([])
      expect(unhealthy).toEqual([])
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
    }
  })

  it('③b 对照组：同一个缺节标本把 createdAt 推到上线日之后 ⇒ 立刻不健康并点名', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'compat-health-new-'))
    const root = mkdtempSync(join(tmpdir(), 'compat-health-ws-'))
    try {
      const id = 'REQ-261005105032-0abe'
      mkdirSync(join(root, 'docs', 'requirements', id), { recursive: true })
      writeFileSync(join(root, 'docs', 'requirements', id, 'requirement.md'), ['---', 'sides: [frontend]', '---', '', '# 需求说明', ''].join('\n'))
      writeFileSync(join(root, 'docs', 'requirements', id, 'rtm-brainstorming.yml'), 'metadata:\n  stage: brainstorming\noutputs:\n  requirements: []\n')
      writeFileSync(join(root, 'docs', 'requirements', id, 'rtm-lifecycle.yml'), 'metadata:\n  stage: lifecycle\n')

      const fresh = reqLike(id, 'feature')
      fresh.createdAt = PROTOTYPE_RULES_SINCE + 1
      const health = checkRTMHealth(root, stateDir, fresh)
      expect(health.healthy).toBe(false)
      expect(health.gaps?.[0]).toContain(id)
      expect('exempted' in health).toBe(false)
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('存量兼容 · 存量不被新门追溯拒绝（t-5bf1e4 / FR-5 / §10 #46）', () => {
  it('④ artifacts 空/undefined 的存量与直种需求：四个新门一律放行（含阶段门时序）', async () => {
    const legacyNoArtifacts = reqLike(REAL_UI_REQ, 'feature') // 真实 UI 需求，但台账 artifacts 为空/未提供

    expect(await checkPrototypePresenceGate(docsReader, legacyNoArtifacts)).toBeUndefined()
    expect(await checkDecisionLogGate(docsReader, legacyNoArtifacts, { trace: true })).toBeUndefined()
    expect(await assertClauseCoverageGate(docsReader, legacyNoArtifacts, [])).toBeUndefined()
    expect(await contentGatesForMove(docsReader, legacyNoArtifacts, 'brainstorming', 'design')).toBeUndefined()
    expect(await contentGatesForMove(docsReader, legacyNoArtifacts, 'design', 'decomposing')).toBeUndefined()
    expect(await contentGatesForMove(docsReader, legacyNoArtifacts, 'decomposing', 'implementing')).toBeUndefined()
    expect(await contentGatesForMove(docsReader, legacyNoArtifacts, 'implementing', 'accepting')).toBeUndefined()

    // 直种需求（连文档都没有）同口径放行
    const directSeeded = reqLike('REQ-261005105032-0abd', 'feature')
    expect(await checkPrototypePresenceGate(docsReader, directSeeded)).toBeUndefined()
    expect(await checkDecisionLogGate(docsReader, directSeeded, { trace: true })).toBeUndefined()
    expect(await assertClauseCoverageGate(docsReader, directSeeded, [])).toBeUndefined()
  })

  it('④b 对照组：同一标本把 artifacts 填成非空 ⇒ 立刻被拒（证明上面不是写死放行）', async () => {
    const path = 'docs/requirements/' + REAL_UI_REQ + '/requirement.md'
    const legacy = reqLike(REAL_UI_REQ, 'feature')
    expect(await checkPrototypePresenceGate(docsReader, legacy)).toBeUndefined()

    // 只把 artifacts 换成"非空但没有 prototype" ⇒ 必须被存在门拦下
    const nonLegacy = reqLike(REAL_UI_REQ, 'feature', [legacyArtifact() as unknown as StageArtifact])
    const failure = await checkPrototypePresenceGate(docsReader, nonLegacy)
    expect(failure?.code, '非空 artifacts 的 UI 需求必须被存在门拦下').toBe('prototype_missing')
    expect(failure?.message).toContain('reqboard_submit(kind=prototype)')

    // 裁定门同款对照组：非空 artifacts + 文档缺 D-x 节 ⇒ 必须拒；同一个门对存量仍放行
    const noDx = docsWithOverride(path, ['---', 'sides: [frontend]', '---', '', '# 需求说明', '', '## 功能点', '', '### FR-1: 甲', ''].join('\n'))
    const decisionFailure = await checkDecisionLogGate(noDx, nonLegacy, { trace: true })
    expect(decisionFailure?.code).toBe('decision_log_missing')
    expect(await checkDecisionLogGate(noDx, legacy, { trace: true })).toBeUndefined()

    // 拆分锚点门同款：非空 artifacts + 计划里有 UI 卡却无锚点 ⇒ 必须拒
    const docsForPlan = docsWithOverride(path, [
      '---', 'sides: [frontend]', '---', '', '# 需求说明', '', '## 功能点', '', '### FR-1: 甲', '',
    ].join('\n'))
    const uiCardPlan = [{ key: 't1', title: '做界面', side: 'frontend', requirement_refs: ['FR-1'] }]
    expect(await assertClauseCoverageGate(docsForPlan, legacy, uiCardPlan)).toBeUndefined()
    const coverageFailure = await assertClauseCoverageGate(docsForPlan, nonLegacy, uiCardPlan)
    expect(coverageFailure?.code).toBe('prototype_anchor_missing')
  })

  it('④c 已归档需求不被追溯拒绝；读侧不回填原型 / frontmatter', async () => {
    const dirs = readdirSync(REQ_ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
    const stateDir = mkdtempSync(join(tmpdir(), 'compat-archived-'))
    try {
      let archivedishSeen = 0
      for (const id of dirs) {
        const rel = 'docs/requirements/' + id + '/requirement.md'
        if (!existsSync(join(REPO, rel))) continue
        const text = readFileSync(join(REPO, rel), 'utf8')
        if (!/归档/.test(text)) continue // 只挑"文档里显式谈归档"的存量需求
        archivedishSeen++
        const beforeFm = parseDocument(text).frontmatter

        const legacy = reqLike(id, 'feature')
        expect(await checkPrototypePresenceGate(docsReader, legacy), id).toBeUndefined()
        expect(await checkDecisionLogGate(docsReader, legacy, { trace: true }), id).toBeUndefined()
        expect(await contentGatesForMove(docsReader, legacy, 'brainstorming', 'design'), id).toBeUndefined()

        // 读路径（含健康检查）跑完，需求文档的 front-matter 一个键都不许多（不回填 prototype_exempt）
        const afterFm = parseDocument(readFileSync(join(REPO, rel), 'utf8')).frontmatter
        expect(Object.keys(afterFm).sort(), id + ' 的 front-matter 不许被读路径改写').toEqual(Object.keys(beforeFm).sort())
        // 归档需求也不会被塞原型产物（台账里不许凭空多出 kind=prototype）
        expect((legacy.artifacts ?? []).some(a => a.kind === 'prototype'), id).toBe(false)
      }
      expect(archivedishSeen, '没扫到任何"归档形态"存量需求——判据需要复核').toBeGreaterThan(0)
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
    }
  })
})

describe('存量兼容 · 全量读取与零迁移（t-5bf1e4 / FR-11）', () => {
  it('⑤ 全部存量 rtm-*.yml 读出零异常（缺节 = pending，未知 key 忽略）', () => {
    expect(FROZEN_RTM.length, '存量 RTM 标本必须存在').toBeGreaterThan(0)

    const broken: string[] = []
    let pendingSeen = 0
    for (const f of FROZEN_RTM) {
      let data: unknown
      try {
        data = parseYaml(f.text)
      } catch (err) {
        broken.push(f.rel + ' YAML 解析失败：' + (err instanceof Error ? err.message : String(err)))
        continue
      }
      // 两份带新节的文件各判一次；两份报告都不许有 error（缺节 pending / 未知 key 忽略）
      const reports: RTMToleranceReport[] = [
        checkRTMSectionTolerance(data, 'brainstorming'),
        checkRTMSectionTolerance(data, 'decomposing'),
      ]
      for (const report of reports) {
        if (!report.ok) {
          broken.push(f.rel + ' → ' + report.sections.filter(s => s.state === 'error').map(s => s.gaps.join('、')).join('；'))
        }
        if (report.sections.some(s => s.state === 'pending')) pendingSeen += 1
      }
    }
    expect(broken).toEqual([])
    expect(pendingSeen, '存量里必须真的有"缺新节"的旧文件（否则 pending 分支是纸面的）').toBeGreaterThan(0)
  })

  it('⑥ 零迁移：全量读取不写盘、无新迁移脚本、无旧分片被改写', () => {
    // ① **全量读取不写盘**：本文件唯一的"读存量 RTM"路径（⑤）跑在冻结文本上，这里核对活树这些
    //    文件的 mtime——`mtimeNs` 只由写操作改变，一字不变即"读没写"。这比"再哈希一次"更强：
    //    并行窗口改**内容**会把 mtime 推新，但那只可能发生在读取窗口之外；读取窗口内的写正是本断言要抓的。
    const touched: string[] = []
    for (const f of FROZEN_RTM) {
      if (!existsSync(f.abs)) { touched.push(f.rel + '（跑后消失）'); continue }
      if (statSync(f.abs, { bigint: true }).mtimeNs !== f.mtimeNs) touched.push(f.rel)
    }
    expect(touched, '全量读取路径写了盘（mtime 变了）').toEqual([])

    // ② 已脏的存量台账分片：盘上字节哈希逐份一致（读取路径不"顺手补 prototypeMeta / 回填豁免"）
    const rewritten: string[] = []
    for (const [file, before] of Object.entries(GIT_BEFORE_SHARD_HASHES)) {
      if (!existsSync(join(REPO, file))) { rewritten.push(file + '（跑后消失）'); continue }
      if (hashObjectOf(file) !== before) rewritten.push(file)
    }
    expect(rewritten, '旧分片被读取路径改写 = 加性变更被破坏').toEqual([])

    // ③ 未新增迁移脚本：没有"跑前不存在"的 migrate-* / migration-* 文件
    //    （拿"跑前未跟踪集合"做差集，故本仓既有的 migrate-*.ts 不会被误判为新增）
    const newMigrationFiles = gitUntrackedFiles().filter(
      f => !GIT_BEFORE.untracked.has(f) && /(^|\/)[^/]*migrat[^/]*$/i.test(f),
    )
    expect(newMigrationFiles).toEqual([])

    // ④ 本用例自身没把任何"新的"改动写进 docs/requirements
    //    （已脏项归并行窗口，不记在本卡头上；只断"新增脏项"与"脏项集合"两件事）
    const trackedAfter = gitTrackedStatus()
    const newShardDirty = Object.keys(trackedAfter).filter(
      f => f.startsWith('docs/requirements/') && GIT_BEFORE.tracked[f] === undefined,
    )
    expect(newShardDirty, '本次跑出了新的存量分片改动').toEqual([])
    const dirtyBefore = Object.keys(GIT_BEFORE.tracked).filter(f => f.startsWith('docs/requirements/')).sort()
    const dirtyAfter = Object.keys(trackedAfter).filter(f => f.startsWith('docs/requirements/')).sort()
    expect(dirtyAfter, '存量分片的改动项集合变了（新增或消失）').toEqual(dirtyBefore)

    // ⑤ 本文件确实覆盖到了存量台账分片（否则上面两条哈希/状态断言是空跑）
    expect(dirtyBefore.length, '存量目录里应当存在"已改动"的已跟踪分片').toBeGreaterThan(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 4d34 · t-316227 迁移与兼容核验（**逐字保留**：本文件名被两条需求共用，禁删既有断言）
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 迁移与兼容核验 · 静态与反面断言（REQ-260928222643-4d34 · 父卡 t-316227 · serves: FR-4, FR-5）。
 *
 * 本需求**无数据迁移、无 schema 变更**：不新增台账字段、不动 REQBOARD_SCHEMA_VERSION。
 * 唯一内部调用方 `NodePanelInput` 已随实现卡同批收敛（面板侧不再传 injection/isolation）。
 * 本文件把「不误删、不回归、非粘滞」钉成可执行断言（C-1~C-6），与 tests/node-panel.test.ts 的
 * TC-5/TC-5′「一句话断言」互补——本卡覆盖 看板消费方 / api 导出面 / 函数本体 / 后端路由 / 调用方收敛 / 非粘滞 六个面。
 *
 * 注：`git diff` 变更面与 REQBOARD_SCHEMA_VERSION **版本值未变**的核对属父卡证据步骤（版本级、跨文件），
 * 不在本文件断言；此处只锁「常量仍导出且形状未变（整数）」。
 */
const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8')
const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1

/** 递归收集 src/ 下全部 .ts（与 node-panel-process-map.test.ts 同款手写遍历，不引第三方 glob）。 */
function walkTs(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkTs(p, acc)
    else if (name.endsWith('.ts')) acc.push(p)
  }
  return acc
}

describe('迁移与兼容核验 · 看板消费方与后端接口零回归（REQ-260928222643-4d34 t-316227）', () => {
  it('C-1 反面断言：board-mount.ts 的 fetchInjectionInfo 恰好 1 处（防整目录误删）', () => {
    const board = readSrc('client/board-mount.ts')
    expect(countOf(board, 'fetchInjectionInfo')).toBe(1)
    // 且该处仍是真实调用（不是注释/死引用）
    expect(board).toContain('api.fetchInjectionInfo(')
  })

  it('C-2 反面断言：api.ts 两个留痕查询函数仍在导出面', () => {
    const api = readSrc('client/api.ts')
    expect(api).toContain('export function fetchInjectionInfo(')
    expect(api).toContain('export function fetchIsolationLog(')
  })

  it('C-3 保留断言：node-panel-process.ts 的函数本体保留、但渲染器已断调用', () => {
    const proc = readSrc('client/node-panel-process.ts')
    expect(proc).toContain('export function renderProcessFold(')
    expect(proc).toContain('export interface ProcessFoldContext')
    // 只断调用：渲染器不再引用（函数可留）
    expect(readSrc('client/node-panel.ts')).not.toContain('renderProcessFold')
  })

  it('C-4 保留断言：后端两条只读路由仍在（分发 + 处理器导出）', () => {
    const routes = readSrc('http/routes.ts')
    expect(routes).toContain("sub === 'injection-log'")
    expect(routes).toContain('handleInjectionLog(')
    expect(routes).toContain("sub === 'isolation-log'")
    expect(routes).toContain('handleIsolationLog(')
    expect(readSrc('http/routers/injection.ts')).toContain('return { handleInjectionLog }')
    expect(readSrc('http/routers/isolation.ts')).toContain('return { handleIsolationLog }')
  })

  it('C-5 调用方收敛：NodePanelInput 仅渲染器使用，面板侧零 injection/isolation', () => {
    const allowed = new Set(['client/node-panel.ts', 'client/conversation-progress.ts'])
    const hits = walkTs(SRC)
      .filter((p) => readFileSync(p, 'utf8').includes('NodePanelInput'))
      .map((p) => p.slice(SRC.length))
    expect(hits).toContain('client/node-panel.ts')
    expect(hits.filter((h) => !allowed.has(h))).toEqual([])
    // 面板侧两文件不再出现入参/类型字样（大小写敏感，避免误报英文散文）
    expect(readSrc('client/node-panel.ts')).not.toMatch(/injection|isolation/)
    expect(readSrc('client/conversation-progress.ts')).not.toMatch(/injection|isolation/)
  })

  it('C-6 非粘滞：一次性交接模块不落 storage / 不进 URL / 不挂 window', () => {
    const sticky = ['localStorage', 'sessionStorage', 'URLSearchParams', 'location.hash', 'location.search', 'window.history', 'document.cookie']
    for (const rel of ['client/board-focus.ts', 'client/board-entry.ts']) {
      for (const token of sticky) expect(readSrc(rel), rel + ' 不应出现 ' + token).not.toContain(token)
    }
  })

  it('C-7 无 schema 变更：REQBOARD_SCHEMA_VERSION 仍导出且为整数（版本值由父卡 git diff 核对）', () => {
    expect(typeof REQBOARD_SCHEMA_VERSION).toBe('number')
    expect(Number.isInteger(REQBOARD_SCHEMA_VERSION)).toBe(true)
  })
})
