/**
 * 工程操作覆盖清单与条目判定（REQ-261001143526-8475 t1 / design/data-model.md）。
 *
 * 这里回答一个问题：**「开发完必须跑什么」到底有哪些，谁还没进规范页？**
 *   - 覆盖来源有三张表：`SCRIPT_TRIGGERS`（package.json scripts → 时机）、
 *     `EXTRA_ENTRIES`（scripts/ 必跑入口白名单）、`EXCLUDED`（排除项 + **必填理由**）；
 *   - `scripts/` 下任何既不在白名单也不在排除表的文件，都算**未归类**（响亮报出，不静默放过）；
 *   - 规范条目的**四要素**（时机 / 命令 / 期望 / 失败怎么办）在这里校验。
 *
 * 零 I/O、零 import 外层：路径是否存在由调用方（kb-probe）用 fs 判定后回传
 * （domain 不许碰 node: —— 层边界门禁）。
 *
 * @module dsh-pmboard/domain/knowledge/operations
 */

/** 四档时机（Agent 按当前阶段取用；与规范页说明一致）。 */
export const OPERATION_TRIGGERS = ['开工前', '改动后', '提交前', '发版前'] as const
export type OperationTrigger = (typeof OPERATION_TRIGGERS)[number]

/** package.json scripts → 时机（缺省 `改动后`）。 */
export const SCRIPT_TRIGGERS: Record<string, OperationTrigger> = {
  typecheck: '改动后',
  'build:client': '改动后',
  'kb:build': '改动后',
  'kb:probe': '改动后',
  'kb:check': '改动后',
  'kb:conventions': '改动后',
  // REQ-261006123819-3af3 FR-2/FR-5：基线判据与提交判据都只在**提交前**才有意义
  // （缺省会落成「改动后」，那"进提交前清单"就只是口头承诺，页面上查不到）。
  'baseline:check': '提交前',
  'commit:check': '提交前',
  // REQ-261005105032-3b02（R4）：它守的是"改了片段却没重生成"这条**静默**失效——
  // 失败信号只在提交前后才有意义，故显式登记为「提交前」（缺省会落成「改动后」，
  // 那样"进提交前清单"就只是口头承诺，页面上查不到）。
  'prompts:check': '提交前',
  test: '提交前',
  build: '发版前',
  prepublishOnly: '发版前',
  prepare: '发版前',
}

export interface ExtraEntry {
  readonly command: string
  readonly trigger: OperationTrigger
  /** 为什么它必须进规范页（白名单不是随手加的）。 */
  readonly reason: string
}

/** scripts/ 目录里必须进规范页的入口（白名单）。 */
export const EXTRA_ENTRIES: readonly ExtraEntry[] = [
  {
    command: 'node scripts/inline-prompt-fragments.mjs',
    trigger: '改动后',
    reason: '改了提示词片段必须重生成产物，否则注入的还是旧文案',
  },
  {
    command: 'node scripts/check-prompt-fragments.mjs',
    trigger: '改动后',
    reason: '重生成后必须校验产物与片段一致（不一致会是静默失效）',
  },
  {
    command: 'npx tsx scripts/prompt-path-probe.mts',
    trigger: '改动后',
    reason: '改了提示词片段或回合指令必须跑：注入面里的路径指针必须可达，否则模板迁移后片段会继续教旧路径且无人报错',
  },
  {
    command: 'npx tsx scripts/reverse-drill-matrix.mts',
    trigger: '改动后',
    reason: '改了任何停机护栏必须跑：拿掉修复 → 判据必须变红，且源码逐字节还原（唯一能证明"护栏没空转"的入口）',
  },
  {
    command: 'npx tsx scripts/reconcile-terminal-drill.mts',
    trigger: '改动后',
    reason: '改了启动对账或冷侧写规则必须跑：在真台账副本上跑对账，逐文件 sha256 证明"零改写"',
  },
  {
    command: 'node scripts/vendor-skills.mjs',
    trigger: '改动后',
    reason: '收录/更新 UI/UX skill 资产必须重算指纹：手改包内资产、或上游换版被静默带进来，都要能被一条命令揪出来',
  },
  // REQ-261007133149-0716（详情页组件化）：外观归属与零变更的两条门禁
  {
    command: 'npx tsx scripts/report-style-snapshot.mts',
    trigger: '改动后',
    reason: '改了详情页外观必须逐组件比对「计算样式 + 几何」快照（判据一：零外观变更）',
  },
  {
    command: 'npx tsx scripts/report-style-ownership.mts',
    trigger: '改动后',
    reason: '组件专属样式只许住自己的分片（判据二：分片归属；公共层禁写具体组件取值）',
  },
  {
    command: 'bash scripts/sync-to-github.sh',
    trigger: '发版前',
    reason: '镜像仓库同步是发版动作的一部分',
  },
]

export interface ExcludedEntry {
  readonly name: string
  /** **必填**：空理由 → 抛错（防止"为了过检查而堆砌/藏起必跑项"）。 */
  readonly reason: string
}

/** 排除表：不进规范页的脚本/入口，逐条写清理由。 */
export const EXCLUDED: readonly ExcludedEntry[] = [
  // 归到「命令入口」而不是脚本文件本身的项：脚本要在这张表里点名，才不会算未归类
  { name: 'token-cost-report.mts', reason: '命令入口是 pnpm cost:report（见 C-32）；脚本本身不再单立条目' },
  { name: 'req-7a43-tab-parity.mts', reason: 'REQ-7a43 的落地对照探针：该需求自己的文档持有使用时机，本文不重复立条目' },
  { name: 'req-7a43-ui-shot.mts', reason: 'REQ-7a43 的界面出图脚本：同上，使用时机归该需求' },
  { name: 'verify:client', reason: '已由 build:client 内含（同一条校验，不重复立条目）' },
  { name: 'kb:build', reason: '已由 kb:check 内含（check = 生成物比对 + 自检）' },
  { name: 'kb:probe', reason: '已由 kb:check 内含' },
  { name: 'kb:conventions', reason: '已由 kb:check 内含（覆盖度比对）' },
  { name: 'kb-probe.mts', reason: '已由 kb:check 内含（自检脚本）' },
  // REQ-261006123819-3af3 FR-2：刷基线是**确认差集非本次引入之后**的例外动作，不是日常步骤；
  // 它在 C-14 的「失败怎么办」里被要求，不另立条目（否则同一件事会有两个入口）。
  { name: 'baseline:refresh', reason: '已由 C-14 的「失败怎么办」要求（确认差集非本次引入后的例外动作），不另立条目' },
  // REQ-261006123819-3af3 FR-2：`pnpm test` **保留在覆盖清单里**（它仍是"全量跑一遍"的入口，
  // kb-operations 的覆盖度规格也钉着它），对应条目是 C-29——C-14 只负责"跑测试并与基线比对"，
  // 两者不是一个操作：C-14 判集合差，C-29 是原始入口。
  { name: 'kb-build.mts', reason: '已由 kb:check 内含（生成物比对）' },
  // REQ-261006123819-3af3 FR-2：集合差基线的实体脚本。**判据入口是 `pnpm baseline:check`**（挂 C-14），
  // 故脚本本体不另立规范条目——与 kb-probe.mts「已由 kb:check 内含」同款先例。
  // 为什么不进 EXTRA_ENTRIES：那会让它成为覆盖项，而匹配它的规范条目随 package.json 脚本同批落，
  // 之间会造成 kb:conventions 的覆盖缺口 + 清单漂移（实测各红一次）。
  { name: 'test-baseline.mts', reason: '已由 C-14 经 pnpm baseline:check 入口挂载（集合差基线判据），脚本本体不另立条目' },
  // REQ-261006123819-3af3 FR-5：提交判据脚本由 C-28 经 pnpm commit:check 入口挂载。
  // 与 test-baseline.mts 同款处置（挂入口、不另立条目）——若改成 EXTRA_ENTRIES，
  // 会多出一条 coverage 项、还要求它自己的 C-NN 条目，等于把同一件事记两遍。
  { name: 'commit-check.mts', reason: '已由 C-28 经 pnpm commit:check 入口挂载（提交判据），脚本本体不另立条目' },
  { name: 'kb-conventions-sync.mts', reason: '已由 kb:conventions 内含（覆盖度比对）' },
  { name: 'prepublishOnly', reason: 'npm 生命周期自动触发（= build + typecheck），不是手动作' },
  { name: 'prepare', reason: 'npm install 时自动触发（= build），不是手动作' },
  { name: 'verify-client-build.mjs', reason: '已由 build:client 内含（wrap 后立即校验）' },
  { name: 'wrap-client.mjs', reason: '已由 build:client 内含' },
  { name: 'header-progress-probe.mts', reason: '按需几何验证，非每次必跑' },
  { name: 'list-responsive-probe.mts', reason: '按需几何验证，非每次必跑' },
  { name: 'knowledge-page-probe.mts', reason: '按需几何验证，非每次必跑' },
  { name: 'kb-coldstart-probe.mts', reason: '冷启动问答材料（验收用），非每次必跑' },
  { name: 'verify-capture-chain.mts', reason: '专项验收脚本（立项链），非每次必跑' },
  // REQ-261004150249-731e（续作交接）：一次性验收探针，非每次必跑
  { name: 'handoff-probe.mts', reason: '专项验收脚本（交接：席位同步 + 绑定同步 + 幂等），非每次必跑' },
  { name: 'workflow-engine-smoke.ts', reason: '冒烟脚本，按需运行' },
  { name: 'verify-t4-rounds.mts', reason: '专项回归脚本（t4 轮次），非每次必跑' },
  { name: 'dump-stage-prompts.mjs', reason: '调试用（打印阶段提示词）' },
  { name: 'clean-test-cache.sh', reason: '本地清理缓存，与正确性无关' },
  // REQ-261005151245-54ae（开窗继承）：把真适配器 + 真用例 + 真继承模块串起来、只换假宿主服务，
  // 打印六读数并断言三对相等；属专项验收探针，非每次必跑（与 handoff-probe 同款）。
  { name: 'open-window-inherit-probe.mts', reason: '专项验收脚本（开窗继承：六读数 + 三对相等），非每次必跑' },
  // REQ-261005154851-8512（难度声明接进取词）：同文本「带声明 vs 不带声明」的取词对比，专项验收探针。
  { name: 'injection-difficulty-probe.mts', reason: '专项验收脚本（难度注入：声明算数 + 无声明与基线逐字相同），非每次必跑' },
  // REQ-261006092213-4f5b（验收项由 agent 实测）：出「看板逐项行」证据图（真渲染器 + 全量真实 CSS）。
  // 与 req-detail-ui-*-shot.mts 同款：证据图按需重出，不属每次必跑的门禁命令。
  { name: 'req-verification-sheet-shot.mts', reason: '专项出图脚本（验收面板逐项行证据图），按需重出' },
  // REQ-261002161439-277d（台账分片）：三个一次性数据搬运脚本，非每次必跑
  { name: 'migrate-ledger-v10.ts', reason: '一次性迁移：v9 单册 → v10 分片（按需运行，已在验收④覆盖）' },
  { name: 'rollback-ledger-v10.ts', reason: '一次性回滚：v10 分片 → v9 单册（退路脚本，按需运行）' },
  { name: 'backfill-task-refs.ts', reason: '一次性回填：把任务卡的需求条款引用补进队列（按需运行）' },
  { name: 'migrate-ledger.ts', reason: '一次性台账迁移，已完成' },
  { name: 'normalize-ledger-paths.ts', reason: '一次性路径归一，已完成' },
  { name: 'normalize-queue-deps.ts', reason: '一次性队列依赖归一，已完成' },
  { name: 'fix-missing-rtm.ts', reason: '一次性补 RTM，已完成' },
  // REQ-261004222448-292a（详情页重构）：新探针按既有惯例排除（与 list-responsive-probe.mts 同款：
  // 几何验证按需跑，不进"每次必跑"清单）；同批一并登记 4 个**此前就未归类**的脚本
  // ——它们让 kb:check 在本次改动之前就已经是红的（已核实：在开工前那个提交上同样报这 4 个），
  // 不登记掉，C-13 这道门就永远过不去。
  { name: 'req-report-probe.mts', reason: '按需几何验证（详情页 1280/900 两档 × 在途/终态），非每次必跑' },
  { name: 'archive-reconcile-drill.mts', reason: '专项演练脚本（归档对账回滚演练），按需运行' },
  // REQ-261006201841-944d t10（FR-8）：存量归档**只读核对**脚本。为什么走 EXCLUDED 而不是
  // EXTRA_ENTRIES：它是"什么时候想核对历史欠债就什么时候跑"的专项入口，不是每次改动必跑；
  // 挂成覆盖项会连带要求它自己的 C-NN 规范条目 + INDEX 行，而 INDEX 已超字符预算（K1 红）。
  { name: 'archive-ledger-audit.mts', reason: '专项只读核对脚本（存量归档对账，报告用），按需运行' },
  { name: 'req-detail-current-specimen.mts', reason: '验收取标本（当前详情页数据快照），非每次必跑' },
  { name: 'migrate-ledger-to-sqlite.ts', reason: '一次性迁移辅助（分片台账 → SQLite，由设置流程驱动），非手工操作' },
  { name: 'migrate-support.ts', reason: '迁移辅助模块（被迁移脚本 import，非入口脚本）' },  // REQ-261005155003-f32f(详情页 UI 优化):本需求新增的出图/报表/评审脚本,
  // 与 req-report-probe.mts 同款(按需跑,不进"每次必跑"清单);同批把**此前就未归类**的
  // 模板门禁探针与其数据文件一并登记——不登记掉 C-13 这道门永远过不去。
  { name: 'req-detail-ui-contrast.mts', reason: '按需对比度报表（FR-4 判据：三类关系 + 豁免登记），非每次必跑' },
  { name: 'req-detail-design-conformance.mts', reason: '按需设计契约一致性判据（原型改造层叠回实现逐元素比对 + 原型内联 CSS 同源校验），改这一页时必跑' },
  { name: 'req-detail-ui-grayscale-shot.mts', reason: '按需灰度评审出图（FR-8 #3：颜色抽掉后三态仍可辨），非每次必跑' },
  { name: 'req-detail-ui-prototype-shot.mts', reason: '按需原型出图 + 几何回填（验收材料），非每次必跑' },
  { name: 'req-detail-ui-shot.mts', reason: '按需 before 基线出图（对照材料），非每次必跑' },
  { name: 'req-detail-ui-variants-shot.mts', reason: '按需候选版出图（设计阶段一次），非每次必跑' },
  { name: 'req-detail-ui-variants-a2-shot.mts', reason: '按需候选版出图（设计阶段一次），非每次必跑' },
  { name: 'req-doc-validate.mts', reason: '按需校验需求文档门禁，非每次必跑' },
  { name: 'rework-inverse-verification.mts', reason: '专项反向验证脚本（返工链），非每次必跑' },
  { name: 'rollback-landing-replay.mts', reason: '专项演练脚本（回滚落点重放），非每次必跑' },
  { name: 'self-gate-dogfood.mts', reason: '按需演练（自门禁自食），非每次必跑' },
  { name: 'template-gate-probe.mts', reason: '已由 templates:check 内含（模板与门禁同源探针）' },
  { name: 'doc-section-parity.mts', reason: '已由 templates:check 内含（节名与必填节一致性）' },
  { name: 'template-render-map.json', reason: '数据文件（模板渲染映射表），非入口脚本' },
  { name: 'fixtures', reason: '目录（标本载荷），非入口脚本；由探针/出图脚本 import' },
  // REQ-261006175040-12d4 t9：卡面门读数的三态+降级出图脚本（真渲染 + 真 CSS + headless Chrome），
  // 属验收对照材料，改卡面渲染时按需跑，非每次必跑。
  { name: 'card-gates-ui-shot.mts', reason: '按需出图（卡面门读数三态 + 降级对照材料，验收用），非每次必跑' },
  // REQ-261006170150-52cc：确认门唯一性探针（gate-request 在制判定），改确认门时按需跑。
  { name: 'gate-inflight-probe.mts', reason: '按需探针（确认门唯一性/在制判定），非每次必跑' },
  // 缺口 2（设计坐标实施后失效且无回写）：设计坐标系探针（design/*.md 的路径可达 + 实施落点回写）。
  // 为什么**不能**进「提交前必须跑」清单：存量 design/*.md 本来就带着一批历史失效坐标（改名/迁移留下），
  // 全仓跑会红一大批——那是「存量需求不追溯」的既定口径，不是本次改动引入的问题；门禁若挂上它，
  // 只会逼人把白名单灌水。故只在改动/复核某个需求时按 `--req` 手动跑（同 req-detail-design-conformance.mts
  // 的处置：按需判据、不进必跑清单），也因此不新增 package.json script（加 script 就得同步 C-NN 条目）。
  {
    name: 'design-coord-probe.mts',
    reason: '按需判据（设计坐标：路径可达 + 实施落点回写）；只在改动/复核时按 --req 手动跑，存量设计文档不追溯，不做提交前清单',
  },
  { name: '.probe', reason: '临时探针产物目录，非入口脚本' },
]



export interface CoverageItem {
  readonly command: string
  readonly trigger: OperationTrigger
  readonly source: 'package.json:scripts' | 'EXTRA_ENTRIES'
}

/** 规范页里的工程操作条目（四要素）。 */
export interface OperationEntry {
  readonly code: string
  readonly id: string
  readonly title: string
  readonly anchor: string
  readonly trigger?: string
  readonly command?: string
  readonly expect?: string
  readonly failure?: string
}

export interface OperationGap {
  readonly command: string
  readonly suggestedCode: string
  readonly suggestedId: string
}

export interface OperationIssue {
  readonly code: string
  readonly detail: string
}

function assertReasons(table: readonly ExcludedEntry[]): void {
  for (const e of table) {
    if (e.reason.trim().length === 0) {
      throw new Error('排除表条目缺少理由（必须写清为什么不进规范页）：' + e.name)
    }
  }
}

/** 必跑项集合 = package.json scripts（去掉排除项）∪ 白名单（去掉排除项）。 */
export function buildCoverage(
  pkgScripts: Readonly<Record<string, string>>,
  extra: readonly ExtraEntry[] = EXTRA_ENTRIES,
  excluded: readonly ExcludedEntry[] = EXCLUDED,
): readonly CoverageItem[] {
  assertReasons(excluded)
  const excludedNames = new Set(excluded.map((e) => e.name))
  const out: CoverageItem[] = []
  for (const name of Object.keys(pkgScripts)) {
    if (excludedNames.has(name)) continue
    out.push({ command: 'pnpm ' + name, trigger: SCRIPT_TRIGGERS[name] ?? '改动后', source: 'package.json:scripts' })
  }
  for (const e of extra) {
    if (excludedNames.has(e.command)) continue
    out.push({ command: e.command, trigger: e.trigger, source: 'EXTRA_ENTRIES' })
  }
  return out
}

/** `scripts/` 下既不在白名单也不在排除表的文件 = 未归类（必须补一类）。 */
export function listUnclassified(
  scriptFiles: readonly string[],
  extra: readonly ExtraEntry[] = EXTRA_ENTRIES,
  excluded: readonly ExcludedEntry[] = EXCLUDED,
): readonly string[] {
  const known = new Set<string>([
    ...extra.map((e) => e.command.split('/').pop() ?? e.command),
    ...excluded.map((e) => e.name),
  ])
  return scriptFiles.filter((f) => !known.has(f))
}

/**
 * 解析规范页里的工程操作条目（`### C-NN 标题 #c-nn` + 四要素行）。
 *
 * **默认只解析 `## 工程操作` 节内**的条目：同一页面里的「规则清单」条目（C-01…C-10）用的是
 * 另一套要素（一句话/校验/症状），不能按四要素校验——否则门禁会把既有规范全判红。
 */
export function parseOperationEntries(conventionsText: string, section = '工程操作'): readonly OperationEntry[] {
  const all = conventionsText.split('\n')
  const secAt = all.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, '').replace(/`/g, '').trim().replace(/\s+#\S+$/, '') === section)
  if (secAt < 0) return []
  let secEnd = all.length
  for (let i = secAt + 1; i < all.length; i += 1) {
    if (/^##\s+/.test(all[i]!)) { secEnd = i; break }
  }
  const lines = all.slice(secAt + 1, secEnd)
  const out: OperationEntry[] = []
  let cur: { code: string; title: string; anchor: string; trigger?: string; command?: string; expect?: string; failure?: string } | undefined
  const flush = (): void => {
    if (cur !== undefined) {
      out.push({ ...cur, id: 'kb-conventions-' + cur.anchor })
      cur = undefined
    }
  }
  for (const line of lines) {
    const head = /^###\s+(C-\d+)\s+(.+?)(?:\s+#([a-z0-9-]+))?\s*$/.exec(line)
    if (head !== null) {
      flush()
      const code = head[1]!
      cur = { code, title: head[2]!.trim(), anchor: head[3] ?? code.toLowerCase() }
      continue
    }
    if (cur === undefined) continue
    const field = /^-\s*(时机|命令|期望|失败怎么办)[:：]\s*(.*)$/.exec(line)
    if (field === null) continue
    const value = field[2]!.trim()
    if (field[1] === '时机') cur.trigger = value
    else if (field[1] === '命令') cur.command = value.replace(/^`|`$/g, '')
    else if (field[1] === '期望') cur.expect = value.replace(/^`|`$/g, '')
    else cur.failure = value
  }
  flush()
  return out
}

const RUNNER_RE = /^(npx|pnpm|node|python3|tsx|bash)\b/
const EXPEXT_ANCHORS = ['OK', 'ok', '退出码', 'passed', 'PASS', '[verify', 'NONE']

/**
 * 四要素校验。
 * @param exists 路径存在性判定（由调用方用 fs 实现；缺省 = 跳过路径检查）
 */
export function validateOperationEntry(
  entry: OperationEntry,
  exists?: (relPath: string) => boolean,
): readonly OperationIssue[] {
  const issues: OperationIssue[] = []
  const at = (detail: string): void => { issues.push({ code: entry.code, detail }) }
  if (entry.trigger === undefined || !(OPERATION_TRIGGERS as readonly string[]).includes(entry.trigger)) {
    at('时机缺失或非法（应为 ' + OPERATION_TRIGGERS.join(' / ') + '）')
  }
  if (entry.command === undefined || entry.command.length === 0) {
    at('缺「命令」')
  } else if (!RUNNER_RE.test(entry.command)) {
    at('命令不是可执行入口（应以 npx/pnpm/node/python3/tsx/bash 起头）：' + entry.command)
  } else if (exists !== undefined) {
    for (const m of entry.command.matchAll(/(?:^|\s)((?:tests|scripts|src|docs)\/[A-Za-z0-9_./-]+)/g)) {
      if (!exists(m[1]!)) at('命令里的路径不存在：' + m[1]!)
    }
  }
  if (entry.expect === undefined || entry.expect.length === 0) {
    at('缺「期望」（要写清看到什么算过）')
  } else if (entry.expect.length > 200) {
    at('「期望」超过 200 字符（实际 ' + String(entry.expect.length) + '）')
  } else if (!EXPEXT_ANCHORS.some((a) => entry.expect!.includes(a))) {
    at('「期望」缺少可对照锚点（如 OK / 退出码 / passed / NONE）')
  }
  if (entry.failure === undefined || entry.failure.length === 0) {
    at('缺「失败怎么办」')
  } else if (!/C-\d+/.test(entry.failure) && !/[A-Za-z0-9_./-]+\/[A-Za-z0-9_./-]+/.test(entry.failure)) {
    at('「失败怎么办」必须指向既有规范 id（C-NN）或修复位置（文件路径）')
  }
  if (entry.failure !== undefined && /待补/.test(entry.failure)) {
    at('「失败怎么办」仍是骨架占位（待补）')
  }
  return issues
}

/** 缺口：覆盖清单里的命令在规范页找不到对应条目（或条目命令不匹配）。 */
export function findGaps(coverage: readonly CoverageItem[], entries: readonly OperationEntry[]): readonly OperationGap[] {
  const gaps: OperationGap[] = []
  let next = nextCodeOf(entries).num
  for (const item of coverage) {
    const hit = entries.some((e) => e.command !== undefined && e.command.includes(item.command))
    if (hit) continue
    const code = 'C-' + String(next).padStart(2, '0')
    next += 1
    gaps.push({ command: item.command, suggestedCode: code, suggestedId: 'kb-conventions-' + code.toLowerCase() })
  }
  return gaps
}

/** 下一个可用编号（取现有最大值 +1）。 */
export function nextCodeOf(entries: readonly OperationEntry[]): { code: string; num: number } {
  const nums = entries.map((e) => Number(/^C-(\d+)$/.exec(e.code)?.[1] ?? '0')).filter((n) => n > 0)
  const num = (nums.length === 0 ? 10 : Math.max(...nums)) + 1
  return { code: 'C-' + String(num).padStart(2, '0'), num }
}

/** 覆盖清单 TSV（生成物）：command / trigger / entry_id / source —— 生成与校验共用的单点。 */
export function renderCoverageTsv(coverage: readonly CoverageItem[], entries: readonly OperationEntry[]): string {
  const rows = coverage.map((item) => {
    const hit = entries.find((e) => e.command !== undefined && e.command.includes(item.command))
    return [item.command, item.trigger, hit?.id ?? '(缺)', item.source].join('\t')
  })
  return ['command\ttrigger\tentry_id\tsource', ...rows].join('\n') + '\n'
}

/** 条目 → 索引行需要的字段（与既有索引行语法对齐）。 */
export function entryToIndexRow(entry: OperationEntry): { id: string; kind: 'standard'; oneLiner: string; pointer: string } {
  const one = entry.title.replace(/[·→\n]/g, ' ').slice(0, 140)
  return { id: entry.id, kind: 'standard', oneLiner: one, pointer: 'conventions.md#' + entry.anchor }
}

/** 生成候选骨架（`--write` 用；「失败怎么办」留占位，由人补）。 */
export function renderEntrySkeleton(item: CoverageItem, code: string, title: string): string {
  const anchor = code.toLowerCase()
  const expect = item.command.startsWith('pnpm ')
    ? '`退出码 0（命令成功）`'
    : '`退出码 0 + 输出里的 OK / PASS 标记`'
  return [
    '### ' + code + ' ' + title + ' #' + anchor,
    '- 时机：' + item.trigger,
    '- 命令：`' + item.command + '`',
    '- 期望：' + expect,
    '- 失败怎么办：（待补：写清失败信号与修复位置，例如 C-0X 或某文件路径）',
  ].join('\n')
}
