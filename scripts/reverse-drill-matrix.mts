/**
 * 反向演练矩阵（**改坏 → 判据必须红 → 逐字节还原**）。
 *
 * ## 为什么要有这个脚本
 *
 * 「用例全绿 / 探针 PASS」不足以证明判据**真的在判**：把实现改回旧形态、把模板节标题改坏、
 * 把提示词里的路径指针指歪——如果判据依然绿，那它测的是空气。本脚本把这类演练固化成
 * **一条命令可复跑**的矩阵：每一处都真改坏、真跑判据、真还原，并把证据与 sha256 打出来。
 *
 * ## 恢复安全（血的教训）
 *
 * 2026-10-04 出过一次事故：还原步骤误用「按路径检出」的还原命令（`checkout --`），把工作区里
 * **多个窗口的未提交改动**一起回退（见 `evidence/AskConfirm.recovery-notes.md`）。故本脚本
 * **只用文件级备份 + sha256 校验恢复**（全仓禁写该检出命令——`tests/canceled-reverse-drill-coverage.test.ts`
 * 第 ⑥ 条把它钉成 0 命中），并在此之上加一道**并发写入检测**：跑判据的这段时间里，
 * 若目标文件已被别的窗口改写（当前内容 ≠ 我们写下的坏版本），**放弃还原并响亮报错**——绝不回写覆盖别人的改动。
 *
 * 两类改坏方式（按"能不能不碰工作区"选）：
 *   · `copy`：把源拷进临时目录再改坏（模板类）——工作区**一个字节都不动**，仍核对工作区 sha256 不变；
 *   · `file`：必须在工作区文件上改坏（提示词片段 / 覆盖度抽取 / 探针自身）——备份 → 改坏 → 跑 →
 *     逐字节还原 → sha256 复核（并发写入则中止）。
 *
 * ## 三个组（为什么默认组换了）
 *
 * | 组 | 来源 | 内容 |
 * |---|---|---|
 * | `hard`（**默认**） | REQ-261005105032-3b02 · t-ed8a64 | 六条必备逆验证：R1 模板节标题 / R1 渲染映射表项 / R2 节名集合 / R3 路径指针 / R4 未重生成 / `stripPrototypeAnchors` 移除；**附**一条几何量硬上限改坏 |
 * | `legacy` | REQ-261004065652-5c1c · t9 | 该需求原来的 6 条（拿掉修复 → vitest 判据必红），**判据与锚点一字未改** |
 * | `canceled` | REQ-261005193546-1b1a · t-848a93 | 已取消卡退出视图与分母的 **14 条**（design/architecture.md §逆验证清单逐条落地） |
 *
 * 默认从"全跑"改为 `hard`：`hard` 是本卡的交付物、也是验收要跑的那六条（`legacy` 属另一条已归档
 * 需求，其六条会临时改 `src/application/dive/**`，在并行窗口同时改这些文件时有冲突风险）。
 * 需要复跑历史六条时显式 `--group legacy`，两组都要 `--group all`。
 *
 * ## `canceled` 组的两条特殊纪律（与 `hard` 组的差异，改这个组前先读）
 *
 * 1. **判据类型要标出来**（`criterion`）：`behavior` = 真跑 vitest 的行为断言会红；
 *    `source-anchor` = **行为等价、只有源码锚点会红**。后者必须单列——t6 实测过：
 *    「基类收敛改回行为等价的手写 filter」时，行为断言**全绿**（写法等价 ⇒ 读数一致），
 *    只有 `tests/canceled-projection-single-source.test.ts` 的源码锚点抓得住。把它混进"行为必红"
 *    里讲，等于宣称行为断言有它其实没有的覆盖力。
 * 2. **14 条全部 `file` 模式**：判据是 vitest **真跑工作区源码**（`src/**` 被 import），
 *    没有"指到别处"的入口 ⇒ `copy` 模式对它们不成立。`copy` 模式的机制仍保留给 `hard` 组的模板类
 *    （那两条判据是独立探针脚本、支持 `--templates-dir`）。安全靠的是备份 + sha256 + 并发写入检测。
 *
 * ## 范围自检（防假绿，2026-10-05 加）
 *
 * 跑之前先核 `target` / `copySources` / `mutateRel` **真的在盘上**：路径写错时演练会"没跑也全绿"的
 * 形态，正是本脚本要消灭的假绿。任一目标不存在 → 立刻退出 1（不进入演练，不改任何文件）。
 *
 * 跑法：
 *   npx tsx scripts/reverse-drill-matrix.mts                    # 默认 hard（本需求六条 + 附一条）
 *   npx tsx scripts/reverse-drill-matrix.mts --group legacy     # REQ-261004065652-5c1c 的六条
 *   npx tsx scripts/reverse-drill-matrix.mts --group canceled   # REQ-261005193546-1b1a 的 14 条
 *   npx tsx scripts/reverse-drill-matrix.mts --group all        # 三组都跑
 *   npx tsx scripts/reverse-drill-matrix.mts --json             # 机器可读（含 criterion / count）
 *
 * 退出码：0 = 所选组的演练全部如预期变红且源码已逐字节还原；1 = 有演练没变红 / 没点名 / 还原失败 /
 * 目标路径不存在（范围自检）。
 *
 * @module dsh-pmboard/scripts/reverse-drill-matrix
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* ── 判据执行 ──────────────────────────────────────────────────────────────── */

interface RunOutput {
  exit: number
  out: string
}

/** 跑一条命令并收口 stdout+stderr（超时 5 分钟：vitest 单文件足够）。 */
function runCommand(cmd: readonly string[]): RunOutput {
  const head = cmd[0]
  if (head === undefined) throw new Error('空命令')
  const r = spawnSync(head, cmd.slice(1), {
    cwd: REPO_ROOT, encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024,
  })
  return { exit: r.status ?? 1, out: String(r.stdout ?? '') + String(r.stderr ?? '') }
}

/** vitest 输出里的红例数（`Tests  N failed`）；没这行 = 0。 */
function redCountOf(output: string): number {
  const m = /Tests\s+(\d+)\s+failed/.exec(output)
  return m === null ? 0 : Number(m[1])
}

/** 从判据输出里挑一行**能当证据**的（点名了改坏点的那一类），没有就取第一行非空。 */
function evidenceLine(out: string, named: readonly string[]): string {
  const lines = out.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const hit = lines.find(l => named.some(n => l.includes(n)))
  return (hit ?? lines[0] ?? '（无输出）').slice(0, 300)
}

/* ── sha256 / 目录指纹 ─────────────────────────────────────────────────────── */

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')

/** 递归列文件（目录指纹用；`.git` 之类不在我们的拷贝源里）。 */
function walkFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walkFiles(p))
    else if (e.isFile()) out.push(p)
  }
  return out
}

/** 文件 = 自身 sha256；目录 = 逐文件（相对路径 + 内容）连结后的 sha256。 */
function fingerprint(p: string): string {
  if (!statSync(p).isDirectory()) return sha(p)
  const h = createHash('sha256')
  for (const f of walkFiles(p).sort()) {
    h.update(relative(p, f))
    h.update('\0')
    h.update(readFileSync(f))
    h.update('\0')
  }
  return h.digest('hex')
}

/* ── 演练定义 ──────────────────────────────────────────────────────────────── */

interface Drill {
  /** 组：hard = REQ-3b02，legacy = REQ-5c1c 的历史六条，canceled = REQ-1b1a 的 14 条 */
  group: 'hard' | 'legacy' | 'canceled'
  /** 判据编号（人读） */
  ref: string
  /** 演练名 */
  name: string
  /** 本卡验收点名的"六条必备"（legacy / canceled 组不计） */
  required?: boolean
  /**
   * 这条演练考的是什么（`canceled` 组必填）：
   *   · `behavior`      = 真跑判据（vitest）时会**因读数不符**变红；
   *   · `source-anchor` = 改坏与修复**行为等价**，读数的行为断言**抓不住**，只有源码锚点会红。
   * 必须写明，否则会把"行为断言"的覆盖力吹大（t6 实测：等价手写 filter 下行为全绿）。
   */
  criterion?: 'behavior' | 'source-anchor'
  /** criterion=source-anchor 时的补充说明（进正常输出与 --json） */
  note?: string
  /** 改坏点的人读描述，必须与 from/to 一致 */
  breakPoint: string
  /** file = 在工作区文件上改坏并还原；copy = 在临时副本上改坏（工作区不动） */
  mode: 'file' | 'copy'
  /**
   * 被改坏的对象（工作区相对路径）。
   * mode=file 时是那个文件；mode=copy 时是**源**（目录或文件），用于"工作区 sha256 未变"的证据。
   */
  target: string
  /** mode=copy 时拷进临时根的源（工作区相对路径，可多个）；缺省 = [target] */
  copySources?: string[]
  /** 改坏点：`from` 必须命中**恰好一次**（未命中 / 多处命中 = 源码已漂移，演练无效） */
  from: string
  to: string
  /**
   * 同一 target 上的**附加**改坏点（可选）：给"改坏点天然有两处"的条目用
   * （例：canceled 组的"两个 body 各自手写"、"只接一个入口"要连 import 一起退回）。
   * 每条同样要求 `from` 命中恰好一次；还原仍靠**整份文件**备份 + sha256（不是逐处回滚）。
   */
  extraEdits?: readonly DrillEdit[]
  /** mode=copy 时改坏哪个文件（相对**仓库根**的路径，落到临时根的同名路径下） */
  mutateRel?: string
  /** 跑判据的命令；`{root}` 会被替换为临时根（mode=copy 时） */
  cmd: string[]
  /** 期望退出码（1 = 判据红；0 或 2 都算"没按预期红"） */
  expectExit: number
  /** 输出里必须点名的片段（判据必须**指着改坏点**说红，而不是别处红） */
  expectNamed: string[]
  /** 只对 vitest 类判据：期望至少几条红 */
  minRed?: number
}

/** 一处 `from` → `to` 的源码替换（`Drill.from/to` 是第一条，`extraEdits` 是其余）。 */
interface DrillEdit {
  from: string
  to: string
}

/** 把 Drill 的第一处改坏点与附加改坏点合成一个列表。 */
function editsOf(d: Drill): DrillEdit[] {
  const first: DrillEdit = { from: d.from, to: d.to }
  return d.extraEdits === undefined ? [first] : [first, ...d.extraEdits]
}

/**
 * 逐处应用改坏点。任一 `from` 未命中或**命中多处** → 返回 `{ ok: false, reason }`（一字节都不写）。
 *
 * 为什么要"恰好一次"：`String.replace` 只换第一处；若锚点本就出现两次（例：`const live = liveTasksOf(tasks)`
 * 在同一文件里有第二处），改坏的可能不是我们要考的那个消费点，演练会变成"考了个寂寞"。
 */
function applyEdits(text: string, edits: readonly DrillEdit[]): { ok: true; text: string } | { ok: false; reason: string } {
  let out = text
  for (let i = 0; i < edits.length; i += 1) {
    const e = edits[i]
    if (e === undefined) continue
    const hits = out.split(e.from).length - 1
    if (hits !== 1) {
      const which = i === 0 ? '主改坏点' : '附加改坏点 #' + String(i)
      return { ok: false, reason: which + '锚点命中 ' + String(hits) + ' 次（要求恰好 1 次）：' + e.from.slice(0, 80) }
    }
    out = out.replace(e.from, e.to)
  }
  return { ok: true, text: out }
}


/**
 * 本卡（REQ-261005105032-3b02）的六条 + 附一条。
 *
 * 六条的两两对照：R1/R2 在**临时副本**上改坏（模板目录支持 `--templates-dir`，
 * 所以工作区 `templates/**` 一个字节都不用碰）；R3/R4/`stripPrototypeAnchors` 在真实文件上改坏
 * （它们没有"指到别处"的入口），靠备份 + sha256 + 并发写入检测保安全。
 */
const HARD_DRILLS: readonly Drill[] = [
  {
    group: 'hard', ref: 'R1', required: true,
    name: 'R1 模板节标题改坏（必填节被改名）',
    breakPoint: 'templates/brainstorming/feature.md：`## 功能点（需求条款）` → `## 功能点X（需求条款）`',
    mode: 'copy', target: 'templates',
    from: '## 功能点（需求条款）', to: '## 功能点X（需求条款）',
    mutateRel: 'templates/brainstorming/feature.md',
    cmd: ['npx', 'tsx', 'scripts/template-gate-probe.mts', '--templates-dir', '{root}/templates'],
    expectExit: 1,
    expectNamed: ['templates/brainstorming/feature.md', '功能点'],
  },
  {
    group: 'hard', ref: 'R1', required: true,
    name: 'R1 渲染映射表项缺失（模板用了未登记占位符）',
    breakPoint: 'scripts/template-render-map.json：删掉 `"PROTOTYPE_REFS"` 登记项（模板里有、表里没有 = 决议 #26 的"没人管"）',
    mode: 'file', target: 'scripts/template-render-map.json',
    from: '    "PROTOTYPE_REFS": "prototypes/detail.html#FR-4",\n', to: '',
    cmd: ['npx', 'tsx', 'scripts/template-gate-probe.mts'],
    expectExit: 1,
    expectNamed: ['{{PROTOTYPE_REFS}}'],
  },
  {
    group: 'hard', ref: 'R2', required: true,
    name: 'R2 节名集合不一致（模板多一节）',
    breakPoint: 'templates/brainstorming/feature.md（副本）：新增 `## 多出来的一节`（门禁不要求它 → 双向比对必红）',
    mode: 'copy', target: 'templates',
    from: '## 边界（不做什么）', to: '## 多出来的一节\n\n（R2 逆验证注入：门禁不要求的自由节）\n\n## 边界（不做什么）',
    mutateRel: 'templates/brainstorming/feature.md',
    cmd: ['npx', 'tsx', 'scripts/doc-section-parity.mts', '--templates-dir', '{root}/templates'],
    expectExit: 1,
    expectNamed: ['多出来的一节'],
  },
  {
    group: 'hard', ref: 'R3', required: true,
    name: 'R3 路径指针指向不存在文件',
    breakPoint: 'src/domain/prompt/fragments/brainstorming/feature.md：插入一行指向 `templates/rewrite-drill-missing-t23.md` 的指针',
    mode: 'file', target: 'src/domain/prompt/fragments/brainstorming/feature.md',
    from: '- [ ] **原型必交**',
    to: '- 见 `templates/rewrite-drill-missing-t23.md`（R3 逆验证注入：该文件不存在）\n- [ ] **原型必交**',
    cmd: ['npx', 'tsx', 'scripts/prompt-path-probe.mts'],
    expectExit: 1,
    expectNamed: ['templates/rewrite-drill-missing-t23.md'],
  },
  {
    group: 'hard', ref: 'R4', required: true,
    name: 'R4 改了片段不重生成（内联产物过期）',
    breakPoint: 'src/domain/prompt/fragments/implementing/feature.md（沙箱副本）：末行追加 `（R4 逆验证注入）`',
    mode: 'copy', target: 'src/domain/prompt',
    copySources: ['scripts/inline-prompt-fragments.mjs', 'scripts/check-prompt-fragments.mjs', 'src/domain/prompt'],
    from: '卡上有原型锚点/关联 D-x 时：先照权威原型（`prototypes/INDEX.md`）的锚点区块与裁定原话动手，不凭记忆。',
    to: '卡上有原型锚点/关联 D-x 时：先照权威原型（`prototypes/INDEX.md`）的锚点区块与裁定原话动手，不凭记忆。\n（R4 逆验证注入：源改了、产物没重生成）',
    mutateRel: 'src/domain/prompt/fragments/implementing/feature.md',
    cmd: ['node', '{root}/scripts/check-prompt-fragments.mjs'],
    expectExit: 1,
    expectNamed: ['首个差异偏移', '不一致'],
  },
  {
    group: 'hard', ref: 'FR-9 / 决议 #6', required: true,
    name: 'stripPrototypeAnchors 移除（锚点又被算成 FR 引用）',
    breakPoint: 'src/application/internal/content-gates.ts：把 `stripPrototypeAnchors` 的实现换成恒等返回（= 抹除拿掉）',
    mode: 'file', target: 'src/application/internal/content-gates.ts',
    from: 'return text.replace(/\\S+#FR-\\d+/g, PROTO_ANCHOR_TOKEN)',
    to: 'return text // 逆验证：抹除拿掉',
    cmd: ['npx', 'vitest', 'run', 'tests/serve-extraction.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['serve-extraction'],
    minRed: 1,
  },
  {
    /* 附：卡面自测点名（"人为把硬上限改成必然违反的值 → 退出码非 0 且打印具体判据"）。
       放在矩阵里而不是手跑，是为了让"还原"也走 sha256 复核这道闸。 */
    group: 'hard', ref: '附 · 验收标准 8',
    name: '几何量硬上限改成必然违反的值（Tab 栏 top ≤ 713 → ≤ 1）',
    breakPoint: 'scripts/req-report-probe.mts：`const TABS_TOP_MAX = 713` → `= 1`（必然违反）',
    mode: 'file', target: 'scripts/req-report-probe.mts',
    from: 'const TABS_TOP_MAX = 713', to: 'const TABS_TOP_MAX = 1',
    cmd: ['npx', 'tsx', 'scripts/req-report-probe.mts'],
    expectExit: 1,
    expectNamed: ['Tab 栏不在首屏内', '上限 1'],
  },
]

/** REQ-261004065652-5c1c t9 的历史六条：判据、锚点、minRed 一字未改地保留在同一脚本里。 */
const LEGACY_DRILLS: readonly Drill[] = [
  {
    group: 'legacy', ref: 'FR-4', name: '投影读己所写（写路径不刷新快照）',
    breakPoint: 'ShardedRequirementStore.ts：刷新拿掉',
    mode: 'file', target: 'src/repositories/ShardedRequirementStore.ts',
    from: '        if (facts !== undefined && this.factsCache !== undefined) this.factsCache.set(id, facts)',
    to: '        // 反向演练：刷新拿掉',
    cmd: ['npx', 'vitest', 'run', 'tests/store-projection-ryow.test.ts', '--reporter=dot'],
    expectExit: 1, expectNamed: [], minRed: 5,
  },
  {
    group: 'legacy', ref: 'FR-1', name: '上游致命错误不可重试（AUTH 落进 transient）',
    breakPoint: 'upstream-failure.ts：`fatal` 恒 false',
    mode: 'file', target: 'src/application/internal/upstream-failure.ts',
    from: "    const fatal = code === 'AUTH' || FATAL_MESSAGE_RE.test(code + ' ' + message)",
    to: '    const fatal = false // 反向演练',
    cmd: ['npx', 'vitest', 'run', 'tests/dive-loop-breaker.test.ts', '--reporter=dot'],
    expectExit: 1, expectNamed: [], minRed: 4,
  },
  {
    group: 'legacy', ref: 'FR-3', name: '内存闭锁 fail-closed（起轮前不看闭锁）',
    breakPoint: 'round-driver.ts：闭锁判定拿掉',
    mode: 'file', target: 'src/application/dive/round-driver.ts',
    from: '    if (latchBlocks(state)) return false',
    to: '    // 反向演练：闭锁判定拿掉',
    cmd: ['npx', 'vitest', 'run', 'tests/dive-loop-breaker.test.ts', '--reporter=dot'],
    expectExit: 1, expectNamed: [], minRed: 1,
  },
  {
    group: 'legacy', ref: 'FR-5', name: '人工门即停手（起轮前不看台账态的门）',
    breakPoint: 'round-driver.ts：人工门分支拿掉',
    mode: 'file', target: 'src/application/dive/round-driver.ts',
    from: '    if (ports.humanGate !== undefined) {',
    to: '    if (false) { // 反向演练',
    cmd: ['npx', 'vitest', 'run', 'tests/dive-human-gate-stop.test.ts', '--reporter=dot'],
    expectExit: 1, expectNamed: [], minRed: 6,
  },
  {
    group: 'legacy', ref: 'FR-8', name: '断点留痕限流（窗口置 0）',
    breakPoint: 'interruption.ts：`INTERRUPTION_MIN_INTERVAL_MS` 置 0',
    mode: 'file', target: 'src/application/internal/interruption.ts',
    from: 'export const INTERRUPTION_MIN_INTERVAL_MS = 10 * 60 * 1000',
    to: 'export const INTERRUPTION_MIN_INTERVAL_MS = 0 // 反向演练',
    cmd: ['npx', 'vitest', 'run', 'tests/interruption-dedupe.test.ts', '--reporter=dot'],
    expectExit: 1, expectNamed: [], minRed: 2,
  },
  {
    group: 'legacy', ref: 'FR-10', name: '引擎开工预检（预检关掉）',
    breakPoint: 'AdvanceChain.ts：预检恒短路',
    mode: 'file', target: 'src/application/use-cases/AdvanceChain.ts',
    from: '  if (probe !== false) return undefined',
    to: '  if (true) return undefined // 反向演练',
    cmd: ['npx', 'vitest', 'run', 'tests/advance-engine-precheck.test.ts', '--reporter=dot'],
    expectExit: 1, expectNamed: [], minRed: 2,
  },
]

/**
 * REQ-261005193546-1b1a（看板不再展示已取消卡）的 14 条：design/architecture.md §逆验证清单逐条落地。
 *
 * 顺序 = 本卡（t-848a93）实施说明里的编号，`ref` 用 `C1`…`C14`（C = canceled，不与 hard 组的 R1…R4 撞名）。
 *
 * 14 条里 **11 条是 `behavior`**（真改坏 → 真跑 vitest → 行为断言红），**3 条是 `source-anchor`**：
 *   · C2：基类收敛改回**行为等价**的手写 filter —— t6 实测行为全绿，只有源码锚点抓得住；
 *   · C3：两个 body 各自再手写一遍 filter —— 基类已收敛 ⇒ 读数不变，只有「新增手写即红」抓得住；
 *   · 以及"只接一个 RTM 入口"里被 `rtm-yaml-live-tasks` 的源码级接线断言同时兜住的那一半（C14 归 behavior，
 *     因为它的读数断言真会红）。
 *
 * 每条都：真改工作区文件（`file` 模式）→ 真跑判据 → 断言退出码 / 红例数 / **点名** → 逐字节还原 + sha256。
 * 判据文件路径写进 `cmd`，`--json` 里逐条可查。
 */
export const CANCELED_DRILLS: readonly Drill[] = [
  {
    group: 'canceled', ref: 'C1', criterion: 'behavior',
    name: '阶段详情基类收敛整段删掉（改前真实状态：各 body 直接吃全量台账）',
    breakPoint: 'src/application/query/QueryStageDetail.ts：`assemble()` 里的活卡收敛**整段改为直通**'
      + '（`liveLedger = ctx.ledger` / `liveCtx = ctx`，等价于那段一字不写 = 改前行为）',
    mode: 'file', target: 'src/application/query/QueryStageDetail.ts',
    from: "    const liveLedger: Pick<TasksView, 'tasks'> = { tasks: liveTasksOf(ctx.ledger.tasks) }\n"
      + '    const liveCtx: AssembleContext = { ...ctx, ledger: liveLedger }',
    to: "    const liveLedger: Pick<TasksView, 'tasks'> = ctx.ledger // 逆验证：收敛整段删掉（直通）\n"
      + '    const liveCtx: AssembleContext = ctx',
    cmd: ['npx', 'vitest', 'run', 'tests/canceled-projection-single-source.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['取消卡条数 === 0'],
    minRed: 1,
  },
  {
    /* ⚠️ 这条**考的是源码锚点，不是行为**：等价写法下读数一字不差，行为断言全绿（t6 实测）。 */
    group: 'canceled', ref: 'C2', criterion: 'source-anchor',
    note: '它考的是源码锚点而不是行为：等价手写 filter 的读数与 liveTasksOf 一字不差 ⇒ '
      + '`canceled-projection-single-source` 的 ①②③④ 全绿，只有第 ⑤ 组「逆验证锚点」会红。'
      + '把它当"行为断言守住了收敛点"来引用，就是夸大覆盖力。',
    name: '阶段详情基类收敛改回行为等价的手写 filter（行为抓不住，源码锚点必红）',
    breakPoint: "src/application/query/QueryStageDetail.ts：`tasks: liveTasksOf(ctx.ledger.tasks)`"
      + " → `tasks: ctx.ledger.tasks.filter(t => t.status !== 'canceled')`（行为等价、漂移源复活）",
    mode: 'file', target: 'src/application/query/QueryStageDetail.ts',
    from: "    const liveLedger: Pick<TasksView, 'tasks'> = { tasks: liveTasksOf(ctx.ledger.tasks) }",
    to: "    const liveLedger: Pick<TasksView, 'tasks'> = { tasks: ctx.ledger.tasks.filter(t => t.status !== 'canceled') } // 逆验证：手写 filter",
    cmd: ['npx', 'vitest', 'run', 'tests/canceled-projection-single-source.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['基类 assemble() 的活卡收敛用的是 liveTasksOf'],
    minRed: 1,
  },
  {
    /* ⚠️ 同样考源码锚点：对照 C1——只逐 body 补 filter（基类不动）时读数不变，行为全绿。 */
    group: 'canceled', ref: 'C3', criterion: 'source-anchor',
    note: '它考的是源码锚点而不是行为：逐 body 各补一遍 filter 时基类仍在收敛 ⇒ 读数不变，'
      + '行为断言全绿；红的是「基线之外的新手写命中 === 0」（点名文件 + 行号 + 行原文）。'
      + '与 C1 成对：C1 证明"整段删掉行为必红"，C3 证明"逐 body 补法行为不红、只能靠源码锚点"'
      + '——这正是设计否掉"逐 body 补"的理由。',
    name: 'QueryStageDetail 两个 body 各自手写 filter（对照 C1 的整段删除：行为不红、源码锚点红）',
    breakPoint: 'src/application/query/QueryStageDetail.ts：拆分 body 与实施 body 各自再挂一遍'
      + "`filter(t => t.status !== 'canceled')`",
    mode: 'file', target: 'src/application/query/QueryStageDetail.ts',
    from: '    const tasks = view.tasks.filter(t => t.requirementId === req.id)',
    to: "    const tasks = view.tasks.filter(t => t.requirementId === req.id).filter(t => t.status !== 'canceled') // 逆验证：逐 body 手写",
    extraEdits: [
      {
        from: '    const mine = view.tasks.filter(t => t.requirementId === req.id)',
        to: "    const mine = view.tasks.filter(t => t.requirementId === req.id).filter(t => t.status !== 'canceled') // 逆验证：逐 body 手写",
      },
    ],
    cmd: ['npx', 'vitest', 'run', 'tests/live-tasks-single-source.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['基线之外的新手写命中 === 0'],
    minRed: 1,
  },
  {
    group: 'canceled', ref: 'C4', criterion: 'behavior',
    name: 'QueryDag 节点数组退回全量 + 转发落盘 layer（掉层与 132 张一起复活）',
    breakPoint: 'src/application/query/QueryDag.ts：`buildDagNodes(live, liveLayers(live))`'
      + ' → `buildDagNodes(tasks, 落盘 layer 索引)`（全量喂入 + 转发历史派生值）',
    mode: 'file', target: 'src/application/query/QueryDag.ts',
    from: '    tasks: buildDagNodes(live, liveLayers(live)),',
    to: '    tasks: buildDagNodes(tasks, new Map((queue?.tasks ?? []).map(t => [t.id, t.layer]))), // 逆验证：退回全量 + 转发落盘 layer',
    cmd: ['npx', 'vitest', 'run', 'tests/canceled-projection-single-source.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['节点数组 === 106'],
    minRed: 1,
  },
  {
    group: 'canceled', ref: 'C5', criterion: 'behavior',
    name: 'handleState 去掉 tasks 收敛（取消卡重回 /state 载荷）',
    breakPoint: 'src/http/routers/stages.ts（handleState）：`const live = liveTasksOf(tasks)`'
      + ' → `const live = tasks`（API 边界那一次收敛拿掉）',
    mode: 'file', target: 'src/http/routers/stages.ts',
    from: '    const live = liveTasksOf(tasks)\n    const { revision } = await st.head()',
    to: '    const live = tasks // 逆验证：tasks 收敛去掉\n    const { revision } = await st.head()',
    cmd: ['npx', 'vitest', 'run', 'tests/canceled-ready-unlock.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['/state 载荷本身'],
    minRed: 1,
  },
  {
    group: 'canceled', ref: 'C6', criterion: 'behavior',
    name: 'handleState 去掉 ready 现算（退回改前「只认 done」的手写筛）',
    breakPoint: 'src/http/routers/stages.ts（handleState）：`liveReadyTasks(live.filter(...))`'
      + " → 改前口径的手写筛（自身 `status === 'todo'` + 前置 `dep.status === 'done'`；"
      + '前置缺省才放行）——**不再走单点现算**。'
      + '实测备注：只把调用换回 `readyTasks(tasks, r.id)` **不足以**变红'
      + '（它已是 `liveReadyTasks` 的薄封装，判据已收敛 ⇒ 行为等价），故此处退回的是判据本身。',
    mode: 'file', target: 'src/http/routers/stages.ts',
    from: '        page.items.map(r => [r.id, liveReadyTasks(live.filter(t => t.requirementId === r.id))]),',
    to: "        page.items.map(r => [r.id, tasks.filter(t => t.requirementId === r.id && t.status === 'todo' && (t.dependsOn ?? []).every(d => { const dep = tasks.find(x => x.id === d); return dep === undefined || dep.status === 'done' })).map(t => t.id)]),",
    cmd: ['npx', 'vitest', 'run', 'tests/canceled-ready-unlock.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['四处集合逐元素相等'],
    minRed: 1,
  },
  {
    group: 'canceled', ref: 'C7', criterion: 'behavior',
    name: 'shared readyTasks 退回只认 done（改前实现逐字复活）',
    breakPoint: 'src/shared/protocol.ts：`readyTasks` 的薄封装退回改前的'
      + '`doneIds` + `t.dependsOn.every(dep => doneIds.has(dep))`',
    mode: 'file', target: 'src/shared/protocol.ts',
    from: '  const inReq = tasks.filter(t => t.requirementId === requirementId)\n'
      + '  const readyIds = new Set(liveReadyTasks(inReq))\n'
      + '  return inReq.filter(t => readyIds.has(t.id))',
    to: '  const inReq = tasks.filter(t => t.requirementId === requirementId)\n'
      + "  const doneIds = new Set(inReq.filter(t => t.status === 'done').map(t => t.id))\n"
      + "  return inReq.filter(t => t.status === 'todo' && t.dependsOn.every(dep => doneIds.has(dep)))",
    cmd: ['npx', 'vitest', 'run', 'tests/live-tasks-ready-single-source.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['输出逐字相等，且都含 t-l'],
    minRed: 1,
  },
  {
    group: 'canceled', ref: 'C8', criterion: 'behavior',
    name: 'computeReady 退回只认 done（写路径判据与读侧再次分叉）',
    breakPoint: 'src/domain/queue/topology.ts：`isReadyTask(task, byId)`'
      + " → 改前的 `task.status !== 'todo'` + `deps.every(dep => byId.get(dep)?.status === 'done')`",
    mode: 'file', target: 'src/domain/queue/topology.ts',
    from: '    if (!deps.every((dep) => byId.has(dep))) continue // 悬空依赖：保守不放行（V-3 检出）\n'
      + '    if (isReadyTask(task, byId)) ready.push(task.id)',
    to: "    if (task.status !== 'todo') continue // 逆验证：退回只认 done\n"
      + "    if (deps.every((dep) => byId.get(dep)?.status === 'done')) ready.push(task.id)",
    cmd: ['npx', 'vitest', 'run', 'tests/canceled-ready-unlock.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['四处集合逐元素相等'],
    minRed: 1,
  },
  {
    group: 'canceled', ref: 'C9', criterion: 'behavior',
    name: 'V-5 假就绪退回只认 done（刚按新口径写出的 ready[] 被自己判成假就绪）',
    breakPoint: 'src/domain/queue/validateQueue.ts（V-5）：`!isDependencySatisfied(byId.get(dep))`'
      + " → `byId.get(dep)?.status !== 'done'`",
    mode: 'file', target: 'src/domain/queue/validateQueue.ts',
    from: '    const unmet = deps.filter((dep) => typeof dep === \'string\' && !isDependencySatisfied(byId.get(dep)))',
    to: "    const unmet = deps.filter((dep) => typeof dep === 'string' && byId.get(dep)?.status !== 'done') // 逆验证：只认 done",
    cmd: ['npx', 'vitest', 'run', 'tests/live-tasks-ready-single-source.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['passed === true，且 issues 里没有 V-5'],
    minRed: 1,
  },
  {
    group: 'canceled', ref: 'C10', criterion: 'behavior',
    name: 'V-5「漏就绪」从 warning 退回 issue（存量陈旧 ready[] 把队列判成没有任务）',
    breakPoint: "src/domain/queue/validateQueue.ts（V-5）：漏就绪那条 `add(...)` 去掉第 4 参 `'warning'`"
      + '（缺省 = issue）',
    mode: 'file', target: 'src/domain/queue/validateQueue.ts',
    from: "`漏就绪：任务 ${id} 依赖已全部了结（done/canceled）且自身 todo，却不在 ready 中`, 'ready', 'warning')",
    to: "`漏就绪：任务 ${id} 依赖已全部了结（done/canceled）且自身 todo，却不在 ready 中`, 'ready') // 逆验证：漏就绪退回 issue",
    cmd: ['npx', 'vitest', 'run', 'tests/canceled-legacy-read.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['「漏就绪」以 warning 级上报'],
    minRed: 1,
  },
  {
    group: 'canceled', ref: 'C11', criterion: 'behavior',
    name: '读取路径把校验失败退回 return undefined（改前形态：不宽容 ⇒ 队列被判不可用）',
    breakPoint: 'src/repositories/QueueRepository.ts（load）：重算后视图之前插回改前那句'
      + '`if (!validateQueueFile(onDisk).passed) return undefined`（= 2026-10-05 前的「整条判不可用」）。'
      + '注意：**只对「落盘视图本身就不通过」的标本变红**——陈旧 `ready[]`（漏就绪 = warning）'
      + '在分档后 `passed === true`，所以本条的判据是「读侧宽容」那一档'
      + '（内容不合规仍要照常返回队列），不是「陈旧派生值」那一档（那档是 C10）。',
    mode: 'file', target: 'src/repositories/QueueRepository.ts',
    from: '    const view = this.recomputeDerived(onDisk)',
    to: '    const view = this.recomputeDerived(onDisk)\n'
      + '    if (!validateQueueFile(onDisk).passed) return undefined // 逆验证：校验失败退回不可用',
    cmd: ['npx', 'vitest', 'run', 'tests/canceled-legacy-read.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['对象根但内容不合规'],
    minRed: 1,
  },
  {
    group: 'canceled', ref: 'C12', criterion: 'behavior',
    name: '客户端 topoLevels 去掉剪边（byId 退回全量 ⇒ 幽灵前置把活卡抬一层）',
    breakPoint: 'src/client/stage-panel.ts（topoLevels）：`byId` 由活卡集合退回**全量** `tasks`'
      + ' ⇒ 指向取消卡的边走 satisfied 分支、按 0 层计入 max（掉层复活）',
    mode: 'file', target: 'src/client/stage-panel.ts',
    from: '  const byId: ReadonlyMap<string, T> = new Map(live.map(t => [t.id, t]))',
    to: '  const byId: ReadonlyMap<string, T> = new Map(tasks.map(t => [t.id, t])) // 逆验证：剪边去掉',
    cmd: ['npx', 'vitest', 'run', 'tests/canceled-layer-parity.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['A（唯一前置已取消）的层号 === 0'],
    minRed: 1,
  },
  {
    group: 'canceled', ref: 'C13', criterion: 'behavior',
    name: '阶段详情 artifacts 换回 artifactsForStage（追溯链 26 个取消卡节点复活）',
    breakPoint: 'src/application/query/QueryStageDetail.ts：`artifacts: liveArtifactsOf(artifactsForStage(...),'
      + ' ctx.ledger.tasks)` → `artifacts: artifactsForStage(req, this.stage)`（不剔卡）',
    mode: 'file', target: 'src/application/query/QueryStageDetail.ts',
    from: '      artifacts: liveArtifactsOf(artifactsForStage(req, this.stage), ctx.ledger.tasks),',
    to: '      artifacts: artifactsForStage(req, this.stage), // 逆验证：追溯链泄漏复活',
    cmd: ['npx', 'vitest', 'run', 'tests/canceled-hidden-view.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['装配出口：取消卡名下的'],
    minRed: 1,
  },
  {
    group: 'canceled', ref: 'C14', criterion: 'behavior',
    name: '只接一个 RTM 入口（syncRTMYamlWithSnapshot 不剔卡 ⇒ 看板三条路由漏接）',
    breakPoint: 'src/application/internal/rtm-yaml.ts（syncRTMYamlWithSnapshot）：函数体顶部'
      + '`const live = liveTasksOf(tasks)` → `const live = tasks`（只给 syncRTMYaml 接线）',
    mode: 'file', target: 'src/application/internal/rtm-yaml.ts',
    from: '  // FR-2（REQ-261005193546-1b1a）：第二个公开入口同样在函数体顶部第一行收敛为活卡。\n'
      + '  // 看板三条路由（requirements.ts:404/:464、tasks.ts:174）**直调本入口、绕过前者**，\n'
      + '  // 缺这一行就漏三条路径（design/backend.md §两个 RTM 公开入口）。\n'
      + '  const live = liveTasksOf(tasks)',
    to: '  const live = tasks // 逆验证：第二个入口不剔卡（只接一个入口）',
    cmd: ['npx', 'vitest', 'run', 'tests/rtm-yaml-live-tasks.test.ts', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['同标本两入口读数逐字段相等'],
    minRed: 1,
  },
]

/** 三个组的取数表（`--group all` 之外一律从这张表按名取，不再用 filter 串联）。 */
const DRILL_GROUPS: Record<'hard' | 'legacy' | 'canceled', readonly Drill[]> = {
  hard: HARD_DRILLS,
  legacy: LEGACY_DRILLS,
  canceled: CANCELED_DRILLS,
}

/**
 * 范围自检：所选组的每个目标都必须在盘上。
 *
 * 防的假绿形态：`target` 写成不存在的路径 → 备份/改坏都落在空气上，判据当然也不会红，
 * 报告却可能被读成"演练通过"。任一缺失 → 调用方退出 1（**不进入演练阶段，不改任何文件**）。
 */
function missingTargets(drills: readonly Drill[]): string[] {
  const missing: string[] = []
  for (const d of drills) {
    const paths = [d.target, ...(d.copySources ?? [])]
    for (const p of paths) {
      try {
        statSync(join(REPO_ROOT, p))
      } catch {
        missing.push(d.ref + ' → ' + p)
      }
    }
    if (d.mutateRel !== undefined) {
      try {
        statSync(join(REPO_ROOT, d.mutateRel))
      } catch {
        missing.push(d.ref + ' → (mutateRel) ' + d.mutateRel)
      }
    }
  }
  return missing
}

/* ── 执行 ──────────────────────────────────────────────────────────────────── */

interface Result {
  group: string
  ref: string
  name: string
  required: boolean
  criterion: 'behavior' | 'source-anchor' | 'unspecified'
  note?: string
  breakPoint: string
  cmd: string
  exit: number
  expectExit: number
  red: number
  minRed: number
  missingNamed: string[]
  restored: boolean
  /** 改坏点锚点没命中 / 命中多处 ⇒ 本次演练无效（未写盘、不算还原失败、不中止后续演练） */
  anchorMiss: boolean
  restoreNote: string
  evidence: string
  ok: boolean
}

/** 临时根里执行改坏 + 跑判据；工作区文件**只读**，跑完删掉整个临时根。 */
function runCopyDrill(d: Drill, work: string): Omit<Result, 'ok'> {
  const root = join(work, 'copy-' + String(Math.random()).slice(2, 8))
  const sources = d.copySources ?? [d.target]
  const before = sources.map(s => fingerprint(join(REPO_ROOT, s)))
  for (const s of sources) {
    const dst = join(root, s)
    mkdirSync(dirname(dst), { recursive: true })
    cpSync(join(REPO_ROOT, s), dst, { recursive: true })
  }
  const mutateRel = d.mutateRel ?? d.target
  const target = join(root, mutateRel)
  const text = readFileSync(target, 'utf8')
  const applied = applyEdits(text, editsOf(d))
  if (!applied.ok) {
    rmSync(root, { recursive: true, force: true })
    return {
      group: d.group, ref: d.ref, name: d.name, required: d.required === true,
      ...criterionOf(d),
      breakPoint: d.breakPoint, cmd: d.cmd.join(' '), exit: -1, expectExit: d.expectExit,
      red: -1, minRed: d.minRed ?? 0, missingNamed: d.expectNamed, restored: false, anchorMiss: true,
      restoreNote: '**锚点未命中**（源码已漂移，演练无效）：' + applied.reason, evidence: '（未跑）',
    }
  }
  writeFileSync(target, applied.text)
  const cmd = d.cmd.map(a => a.replace('{root}', root))
  let r: RunOutput = { exit: -1, out: '' }
  try {
    r = runCommand(cmd)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  const unchanged = sources.every((s, i) => fingerprint(join(REPO_ROOT, s)) === before[i])
  return {
    group: d.group, ref: d.ref, name: d.name, required: d.required === true,
    ...criterionOf(d),
    breakPoint: d.breakPoint, cmd: cmd.join(' '), exit: r.exit, expectExit: d.expectExit,
    red: redCountOf(r.out), minRed: d.minRed ?? 0,
    missingNamed: d.expectNamed.filter(n => !r.out.includes(n)),
    restored: unchanged, anchorMiss: false,
    restoreNote: unchanged
      ? '工作区 `' + sources.join('` + `') + '` sha256 前后一致（改坏只发生在临时副本）'
      : '**工作区指纹变了**：临时副本流程不该动工作区，立即中止核查',
    evidence: evidenceLine(r.out, d.expectNamed),
  }
}

/** 工作区文件上改坏：备份 → 改坏 → 跑判据 → 还原 + sha256 复核（并发写入则放弃还原）。 */
function runFileDrill(d: Drill): Omit<Result, 'ok'> {
  const abs = join(REPO_ROOT, d.target)
  const before = readFileSync(abs)
  const beforeHash = sha(abs)
  const text = before.toString('utf8')
  const applied = applyEdits(text, editsOf(d))
  if (!applied.ok) {
    return {
      group: d.group, ref: d.ref, name: d.name, required: d.required === true,
      ...criterionOf(d),
      breakPoint: d.breakPoint, cmd: d.cmd.join(' '), exit: -1, expectExit: d.expectExit,
      red: -1, minRed: d.minRed ?? 0, missingNamed: d.expectNamed, restored: false, anchorMiss: true,
      restoreNote: '**锚点未命中**（源码已漂移，演练无效）：' + applied.reason, evidence: '（未跑）',
    }
  }
  writeFileSync(abs, applied.text)
  const brokenHash = sha(abs)
  let r: RunOutput = { exit: -1, out: '' }
  let conflict = false
  try {
    r = runCommand(d.cmd)
  } finally {
    if (sha(abs) !== brokenHash) {
      // 别的窗口在演练期间写了同一文件：**绝不回写**（回写就是覆盖他人改动，= 2026-10-04 事故的形态）
      conflict = true
    } else {
      writeFileSync(abs, before)
    }
  }
  const restored = !conflict && sha(abs) === beforeHash
  return {
    group: d.group, ref: d.ref, name: d.name, required: d.required === true,
    ...criterionOf(d),
    breakPoint: d.breakPoint, cmd: d.cmd.join(' '), exit: r.exit, expectExit: d.expectExit,
    red: redCountOf(r.out), minRed: d.minRed ?? 0,
    missingNamed: d.expectNamed.filter(n => !r.out.includes(n)),
    restored, anchorMiss: false,
    restoreNote: conflict
      ? '**检测到并发写入**：演练期间该文件被别的窗口改写 → 已放弃还原（不覆盖他人改动），请人工核查'
      : (restored ? '已逐字节还原，sha256 复核一致（' + beforeHash.slice(0, 12) + '…）' : '**还原失败**：sha256 与备份不一致'),
    evidence: evidenceLine(r.out, d.expectNamed),
  }
}

/** `criterion` / `note` 的规范化（未标 = `unspecified`，由覆盖度用例拦住新条目漏标）。 */
function criterionOf(d: Drill): { criterion: Result['criterion']; note?: string } {
  return {
    criterion: d.criterion ?? 'unspecified',
    ...(d.note !== undefined ? { note: d.note } : {}),
  }
}

function judge(r: Omit<Result, 'ok'>): Result {
  const exited = r.exit === r.expectExit
  const redOk = r.minRed === 0 || r.red >= r.minRed
  const namedOk = r.missingNamed.length === 0
  return { ...r, ok: exited && redOk && namedOk && r.restored }
}

function main(): void {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const gi = argv.indexOf('--group')
  const group = gi >= 0 ? (argv[gi + 1] ?? '') : 'hard'
  if (!['hard', 'legacy', 'canceled', 'all'].includes(group)) {
    console.error('用法：npx tsx scripts/reverse-drill-matrix.mts [--json] [--group hard|legacy|canceled|all]')
    process.exit(2)
  }
  const drills = group === 'all'
    ? [...HARD_DRILLS, ...LEGACY_DRILLS, ...CANCELED_DRILLS]
    : DRILL_GROUPS[group as 'hard' | 'legacy' | 'canceled']

  // 范围自检（防假绿）：目标不在盘上就退出 1 —— 此时**一个字节都没改**。
  const missing = missingTargets(drills)
  if (missing.length > 0) {
    console.error('[范围自检失败] 所选组有 target 不在盘上（路径写错时演练会"没跑也全绿"）：')
    for (const m of missing) console.error('  · ' + m)
    process.exit(1)
  }

  const work = mkdtempSync(join(tmpdir(), 'pmboard-drills-'))
  const results: Result[] = []
  try {
    for (const d of drills) {
      const raw = d.mode === 'copy' ? runCopyDrill(d, work) : runFileDrill(d)
      const r = judge(raw)
      results.push(r)
      // 锚点未命中 = 演练无效（没写盘），继续把余下条目跑完，别让一条错锚点掩住其余问题；
      // 还原失败 / 并发写入才是**立刻中止**（绝不带着半改状态继续跑下一项）。
      if (!r.restored && !r.anchorMiss) {
        console.error('[中止] ' + d.target + ' ' + r.restoreNote + '，停止后续演练。')
        break
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  const allOk = results.length === drills.length && results.every(r => r.ok)
  const required = results.filter(r => r.required)
  const requiredOk = required.filter(r => r.ok).length
  const anchorOnly = results.filter(r => r.criterion === 'source-anchor').length

  if (asJson) {
    console.log(JSON.stringify({
      group, allOk, count: results.length, expectedCount: drills.length,
      requiredOk, requiredTotal: required.length, sourceAnchorCount: anchorOnly, results,
    }, null, 2))
    if (!allOk) process.exitCode = 1
    return
  }

  console.log('== 反向演练矩阵（改坏 → 判据必须红 → 逐字节还原）==')
  console.log('组：' + group + '（hard = REQ-261005105032-3b02 六条必备 + 附一条；'
    + 'legacy = REQ-261004065652-5c1c 六条；canceled = REQ-261005193546-1b1a 十四条）')
  for (const r of results) {
    console.log((r.ok ? '✅' : '❌') + ' [' + r.ref + '] ' + r.name + (r.required === true ? '（必备）' : ''))
    // 判据类型只对**标了**的条目打印（`canceled` 组）：hard / legacy 两组的输出格式保持原样，
    // 免得"未标注"被读成本组的缺陷。
    if (r.criterion !== 'unspecified') {
      console.log('     判据类型：' + (r.criterion === 'source-anchor'
        ? '源码锚点（行为等价，行为断言抓不住）'
        : '行为断言'))
    }
    console.log('     改坏点：' + r.breakPoint)
    console.log('     判据命令：' + r.cmd)
    console.log('     退出码 ' + String(r.exit) + '（期望 ' + String(r.expectExit) + '）'
      + (r.minRed > 0 ? ' ｜ 红例 ' + String(r.red) + '（期望 ≥' + String(r.minRed) + '）' : '')
      + (r.missingNamed.length > 0 ? ' ｜ **未点名**：' + r.missingNamed.join(' / ') : ' ｜ 点名命中'))
    console.log('     还原：' + r.restoreNote)
    if (r.note !== undefined) console.log('     限定语：' + r.note)
    console.log('     证据：' + r.evidence)
  }
  if (group === 'hard' || group === 'all') {
    console.log('\n必备六条：' + String(requiredOk) + '/' + String(required.length) + ' 判为必红')
    if (group === 'hard') console.log('（REQ-261004065652-5c1c 的历史六条用 --group legacy 复跑；三组都要用 --group all）')
  }
  if (group === 'canceled') {
    console.log('\ncanceled 组：' + String(results.length) + ' 条（其中源码锚点 ' + String(anchorOnly)
      + ' 条——行为等价、只有源码锚点会红，引用时不得当成行为断言的覆盖力）')
  }
  console.log(allOk
    ? '\n[通过] 所选组全部演练如预期变红，且每一处的还原都过了 sha256 核对。'
    : '\n[失败] 有演练没变红 / 没点名 / 锚点未命中 / 还原失败——不得宣称判据有效。')
  if (!allOk) process.exitCode = 1
}

// vitest 会 import 本模块（覆盖度用例读 CANCELED_DRILLS），此时**不得**跑 main()——
// 否则一条只读用例会真的去改工作区源码。`VITEST` 由 vitest 注入；命令行跑（tsx / node）时没有它。
if (process.env.VITEST === undefined) main()

