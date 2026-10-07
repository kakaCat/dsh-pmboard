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
 * | `hard`（**默认**） | REQ-261005105032-3b02 · t-ed8a64 | 六条必备逆验证：R1 模板节标题 / R1 渲染映射表项 / R2 节名集合 / R3 路径指针 / R4 未重生成 / `stripPrototypeAnchors` 移除；**附**一条几何量硬上限改坏；**再附**一条缺口 2 的设计坐标改坏（`design-coord-probe --req`） |
 * | `legacy` | REQ-261004065652-5c1c · t9 | 该需求原来的 6 条（拿掉修复 → vitest 判据必红），**判据与锚点一字未改** |
 * | `canceled` | REQ-261005193546-1b1a · t-848a93 | 已取消卡退出视图与分母的 **14 条**（design/architecture.md §逆验证清单逐条落地） |
 * | `archive` | REQ-261006201841-944d · t-02fa7f | 归档加固的三条：**RV-1** 桩工作区提交 `merged_into` 指向不存在的文档 → 必被拒并点名（材料逐字节还原后同一次提交通过）；**RV-2** 把 `kb-probe` 的 K13 分支整段注释掉 → 指定用例必红、还原后复绿；**RV-3** 台账**副本**上跑只读核对 → 七项读数逐条对得上且两棵树 sha256 未变（详见 `ARCHIVE_DRILLS`） |
 *
 * 默认从"全跑"改为 `hard`：`hard` 是本卡的交付物、也是验收要跑的那六条（`legacy` 属另一条已归档
 * 需求，其六条会临时改 `src/application/dive/**`，在并行窗口同时改这些文件时有冲突风险）。
 * 需要复跑历史六条时显式 `--group legacy`，两组都要 `--group all`。
 *
 * `archive` 组**单独取**（`ARCHIVE_DRILLS`），既不在 `DRILL_GROUPS` 里、也不并进 `--group all`：
 * 它的 RV-3 要拷用户本机真台账、RV-2 要 spawn 一次 vitest ⇒ 并进 `all` 会让"三组都跑"这条既有口径
 * 多出对**真台账内容**的依赖（别人归档一条就让 `all` 变色）。理由与既有用例的断言边界写在
 * `DRILL_GROUPS` 上方与 `main()` 的用法行旁边。
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
 *   npx tsx scripts/reverse-drill-matrix.mts --group archive    # REQ-261006201841-944d 的 RV-1/2/3
 *   npx tsx scripts/reverse-drill-matrix.mts --group all        # 三组（hard + legacy + canceled）都跑
 *   npx tsx scripts/reverse-drill-matrix.mts --json             # 机器可读（含 criterion / count）
 *
 * 退出码：0 = 所选组的演练全部如预期（`hard`/`legacy`/`canceled` = 判据**红**；`archive` 的
 * RV-1/RV-3 是内联执行器的判据**成立**，故其 `expectExit` 为 0）且源码已逐字节还原；
 * 1 = 有演练没变红 / 没点名 / 还原失败 / 目标路径不存在（范围自检）。
 *
 * @module dsh-pmboard/scripts/reverse-drill-matrix
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
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

/**
 * 执行器真正需要的**结构最小面**（`Drill` 与 `ArchiveDrill` 都满足它）。
 *
 * 为什么要这一层：`archive` 组（REQ-261006201841-944d · t-02fa7f）里 RV-1 / RV-3 两条
 * **不是"改一处源码"型**演练（改坏点分别在桩工作区的提交材料、以及"台账副本上的读数"），
 * 它们没有 `target`/`from`/`to`；RV-2 有，且要与既有 `file` 执行器**逐字复用**同一套
 * 备份 + sha256 + 并发写入检测。与其把 `Drill` 的必填字段改成可选（那会削弱既有三组的类型约束），
 * 不如把执行器的入参收窄成这个最小面：`Drill` 原样传入，`ArchiveDrill` 由 `mutateSpecOf()` 显式收敛。
 */
interface MutateSpec {
  group: string
  ref: string
  name: string
  required?: boolean
  criterion?: 'behavior' | 'source-anchor'
  note?: string
  breakPoint: string
  target: string
  copySources?: string[]
  from: string
  to: string
  extraEdits?: readonly DrillEdit[]
  mutateRel?: string
  cmd: string[]
  expectExit: number
  expectNamed: string[]
  minRed?: number
  /**
   * **还原后**再跑一次判据（可选，只有 `archive` 组的 RV-2 用）：
   * "删掉即红"只证明判据有覆盖力，"还原后复绿"才排除"红是因为工作区被永久改坏"。
   * 只对 `file` 模式生效（`copy` 模式的改坏点在临时副本里，工作区本来就没动过，不需要复跑）。
   * 复跑不绿 → 本条 `restored=false`（并触发主流程中止），**不新增 Result 字段**（--json 形状不变）。
   */
  restoreCheckCmd?: string[]
}

/** 范围自检要看的最小面（`target` 可缺省：定制执行器自己核它的前置件）。 */
interface RangeSpec {
  ref: string
  target?: string
  copySources?: string[]
  mutateRel?: string
}

/** 把 Drill 的第一处改坏点与附加改坏点合成一个列表。 */
function editsOf(d: MutateSpec): DrillEdit[] {
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
 * 本卡（REQ-261005105032-3b02）的六条 + 附一条，外加缺口 2（设计坐标）的一条。
 *
 * 六条的两两对照：R1/R2 在**临时副本**上改坏（模板目录支持 `--templates-dir`，
 * 所以工作区 `templates/**` 一个字节都不用碰）；R3/R4/`stripPrototypeAnchors` 在真实文件上改坏
 * （它们没有"指到别处"的入口），靠备份 + sha256 + 并发写入检测保安全。
 *
 * 末条（设计坐标）是为 `scripts/design-coord-probe.mts` 加的：它改的是一份**真实设计文档**里的
 * 路径 token（设计文档没有"指到别处"的入口，只能 file 模式），同样靠备份 + sha256 保安全。
 * 选 `REQ-260930182521-4fee` 的理由写在该条目注释里（它当前全绿 ⇒ exit 1 的因果干净）。
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
  {
    /* 缺口 2（设计坐标实施后失效且无回写）：设计文档点名的路径必须能在盘上解析。
       为什么挑 `REQ-260930182521-4fee`：它当前对 `design-coord-probe` 是**全绿**的
       （6 个路径 token 全部存在、通报落点 0 条），所以此处的 exit 1 只可能来自本次改坏——
       判据的因果是干净的，不靠"本来就有别的缺口顺带红"。
       改坏点在 `design/architecture.md` 的模块改动地图里出现**恰好一次**（已核），
       还原仍走文件级备份 + sha256 + 并发写入检测。 */
    group: 'hard', ref: '缺口 2 · 设计坐标',
    name: '设计文档里的路径 token 改成不存在的文件（设计坐标探针必红并点名）',
    breakPoint: 'docs/requirements/REQ-260930182521-4fee/design/architecture.md：'
      + '`src/client/styles/node-panel.ts` → `src/client/styles/node-panel-typo.ts`（不存在）',
    mode: 'file', target: 'docs/requirements/REQ-260930182521-4fee/design/architecture.md',
    from: 'src/client/styles/node-panel.ts', to: 'src/client/styles/node-panel-typo.ts',
    cmd: ['npx', 'tsx', 'scripts/design-coord-probe.mts', '--req', 'REQ-260930182521-4fee'],
    expectExit: 1,
    expectNamed: ['src/client/styles/node-panel-typo.ts'],
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

/* ── archive 组（REQ-261006201841-944d · t-02fa7f：RV-1 / RV-2 / RV-3）─────────── */

/** RV-1 的改坏路径（盘上不存在）：拒绝消息必须**点名**它。单一常量，条目与执行器共用。 */
const RV1_BAD_TARGET = 'docs/architecture/__no_such_doc__.md'

/**
 * RV-3 的期望读数：台账**副本**上跑 `archive-ledger-audit --json` 的 `totals`。
 *
 * 键名**逐字取自脚本自己发出的 JSON**（不是这里另起的名字，跑一次 `--json` 就能对上）。
 * ⚠️ 这是**时点快照**：台账 revision 与各项目工作区的说明书都会变，读数对不上时本演练判红。
 * 判红先分因：是"别的窗口又归档了一条 / 改了 project-manual 的标题"（真漂移，读数该更新
 * ——但那要人来裁定，不归演练改）还是"审计脚本的判据真的坏了"。**禁止**为了让演练变绿改这里的数字：
 * 改数字 = 把判据本身改成空气，正是本脚本存在的理由。
 */
const RV3_EXPECTED_TOTALS: readonly (readonly [string, number])[] = [
  ['realMissingTargets', 2], // 真失效（按每条需求自己的根解析）
  ['missingTargetsOnFallbackRoot', 2], // 其中落在「归属未知 → 当前工作区兜底」档的条数
  ['sectionDriftStrict', 22], // 说明书锚点漂移（严格口径）
  ['sectionDriftLooksLikeSection', 14], // 说明书锚点漂移（像章节引用口径）
  ['missingManualPath', 1], // manual_updates[].path 本身不存在
  ['unknownRoot', 3], // 归属未知（记录无 workspaceRoot）
  ['naiveMissing', 15], // 对照读数：按当前工作区直接比会误判的条数
]

/**
 * `archive` 组的三条（REQ-261006201841-944d · t-02fa7f 的验收判据 RV-1/2/3）。
 *
 * 与 `Drill` 的差别（为什么另立一个类型而不改 `Drill`）：RV-1 / RV-3 的"改坏点"不在工作区源码里
 * ——RV-1 改的是**桩工作区的提交材料**、RV-3 是**台账副本上的读数核对**，两者都没有
 * `target`/`from`/`to` 可填；把它们塞进 `Drill` 只能填假值或把必填字段改成可选（后者会削弱既有三组）。
 * 故：`mode` 取值 `file`（RV-2，走既有执行器）/ `rv1` / `rv3`（走定制执行器 `runArchiveCustomDrill`）。
 */
interface ArchiveDrill {
  group: 'archive'
  /** 判据编号（人读；与 design/test-cases.md 的 TC-51/52/53 一一对应） */
  ref: string
  name: string
  /** 这条演练考的是什么（沿用 `canceled` 组的口径：behavior / source-anchor） */
  criterion?: 'behavior' | 'source-anchor'
  note?: string
  /** 改坏点的人读描述（与执行器实际做的事一致） */
  breakPoint: string
  /** file = 既有"工作区改坏 + sha256 还原"；rv1 / rv3 = 定制执行器 */
  mode: 'file' | 'rv1' | 'rv3'
  target?: string
  from?: string
  to?: string
  /** `file` 条的附加改坏点（RV-2：K13 段首开块注释、K14 段首闭块注释，共两处） */
  extraEdits?: readonly DrillEdit[]
  cmd: string[]
  /** 定制执行器的判据成立 → 0（与既有条目"判据红 → 1"的语义分开，见各执行器注释） */
  expectExit: number
  expectNamed: string[]
  minRed?: number
  /** 还原后复跑判据（可选，只有 RV-2 用；语义与 `MutateSpec.restoreCheckCmd` 同） */
  restoreCheckCmd?: string[]
}

export const ARCHIVE_DRILLS: readonly ArchiveDrill[] = [
  {
    group: 'archive', ref: 'RV-1', criterion: 'behavior',
    name: '合并去向指向不存在的文档 → 归档提交必被拒且点名路径 / 生效根 / 判据来源；材料逐字节还原后同一次提交通过',
    breakPoint: '桩工作区（mktemp）的提交材料文件 `submit-materials.json`：'
      + '`merged_into` 由桩说明书 → `' + RV1_BAD_TARGET + '`（盘上不存在的路径）',
    mode: 'rv1',
    cmd: ['（内联执行器 RV-1）桩工作区 + 内存 store → 真 SubmitArchive 闸（kind=archive）'],
    expectExit: 0,
    expectNamed: [RV1_BAD_TARGET, 'by=path-fallback', 'REQBOARD_FILE_MISSING'],
  },
  {
    group: 'archive', ref: 'RV-2', criterion: 'behavior',
    name: '把 kb-probe 的 K13 分支整段注释掉 → 指定用例「① 冷侧有归档材料但无 req 条目 → K13 红」必变红（不是"无覆盖"）',
    breakPoint: 'scripts/kb-probe.mts：K13 分支（`// ── K13：归档沉淀覆盖度 …` 到 '
      + '`// ── K14：失效条件可判定 …` 之前）用 `/* … */` 整段注释掉 ⇒ `add(\'K13\', …)` 不再执行',
    mode: 'file', target: 'scripts/kb-probe.mts',
    from: '// ── K13：归档沉淀覆盖度 = 冷侧',
    to: '/* RV-2 逆验证：K13 分支整段注释掉（add(\'K13\', …) 不再执行；用例① 必须变红，'
      + '且必须是"断言失败"不是"没有覆盖"）\n  // ── K13：归档沉淀覆盖度 = 冷侧',
    extraEdits: [
      {
        from: '// ── K14：失效条件可判定',
        to: '*/\n  // ── K14：失效条件可判定',
      },
    ],
    cmd: ['npx', 'vitest', 'run', 'tests/kb-coverage-probe.test.ts',
      '-t', '冷侧有归档材料但无 req', '--reporter=dot'],
    expectExit: 1,
    expectNamed: ['冷侧有归档材料但无 req'],
    minRed: 1,
    // 同一条命令再跑一次：还原后必须复绿（"变红"可能来自"永久改坏"，复跑才排除这种解释）。
    restoreCheckCmd: ['npx', 'vitest', 'run', 'tests/kb-coverage-probe.test.ts',
      '-t', '冷侧有归档材料但无 req', '--reporter=dot'],
  },
  {
    group: 'archive', ref: 'RV-3', criterion: 'behavior',
    name: '台账副本上跑只读核对 → 7 项读数逐条对得上，且副本树与真台账树 sha256 均逐字节未变',
    breakPoint: '不改任何文件：把真台账（<DSH_HOME|~/.dsh>/reqboard）拷成副本，'
      + '在副本上跑 `archive-ledger-audit --json`，核对 totals 七项读数 + 两棵树的 sha256 + 副本之外零新增文件',
    mode: 'rv3',
    cmd: ['npx', 'tsx', 'scripts/archive-ledger-audit.mts', '--ledger-root', '<副本>', '--json'],
    expectExit: 0,
    expectNamed: RV3_EXPECTED_TOTALS.map(e => e[0] + '=' + String(e[1])),
  },
]

/**
 * 三个**既有**组的取数表（`--group all` 之外一律从这张表按名取，不再用 filter 串联）。
 *
 * `archive` 组**不进这张表、也不进 `all`**（`ARCHIVE_DRILLS` 单独取）：它是本需求
 * （REQ-261006201841-944d）自己的验收命令 `--group archive`，且 RV-3 会**拷真台账**、
 * RV-2 会 spawn 一次 vitest——把它并进 `all` 会让"三组都跑"这条既有口径悄悄多出对
 * 「用户本机真台账内容」的依赖。既有用例只逐字断言 `'canceled', 'all'` 这一段相邻关系
 * （tests/canceled-reverse-drill-coverage.test.ts ⑦），没有对 `all` 的条数断言，故此处保守不动。
 */
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
function missingTargets(drills: readonly RangeSpec[]): string[] {
  const missing: string[] = []
  for (const d of drills) {
    const paths = [...(d.target === undefined ? [] : [d.target]), ...(d.copySources ?? [])]
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
function runCopyDrill(d: MutateSpec, work: string): Omit<Result, 'ok'> {
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
function runFileDrill(d: MutateSpec): Omit<Result, 'ok'> {
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
  const bytesBack = !conflict && sha(abs) === beforeHash
  // 还原后复跑（可选）：证明「红」来自改坏、`还原` 之后判据真的复绿（RV-2 的"还原后复绿"判据）。
  let recheckNote = ''
  let recheckEvidence = ''
  let restored = bytesBack
  if (bytesBack && d.restoreCheckCmd !== undefined) {
    const rr = runCommand(d.restoreCheckCmd)
    const red = redCountOf(rr.out)
    const green = rr.exit === 0 && red === 0
    recheckNote = green
      ? '；还原后复跑判据：**复绿**（退出码 0 / 红例 0）'
      : '；**还原后复跑判据仍不绿**（退出码 ' + String(rr.exit) + ' / 红例 ' + String(red) + '）'
    recheckEvidence = ' ｜ 还原后复跑：退出码 ' + String(rr.exit) + '、红例 ' + String(red)
      + '（命令 ' + d.restoreCheckCmd.join(' ') + '）'
    if (!green) restored = false
  }
  return {
    group: d.group, ref: d.ref, name: d.name, required: d.required === true,
    ...criterionOf(d),
    breakPoint: d.breakPoint, cmd: d.cmd.join(' '), exit: r.exit, expectExit: d.expectExit,
    red: redCountOf(r.out), minRed: d.minRed ?? 0,
    missingNamed: d.expectNamed.filter(n => !r.out.includes(n)),
    restored, anchorMiss: false,
    restoreNote: conflict
      ? '**检测到并发写入**：演练期间该文件被别的窗口改写 → 已放弃还原（不覆盖他人改动），请人工核查'
      : (bytesBack ? '已逐字节还原，sha256 复核一致（' + beforeHash.slice(0, 12) + '…）' + recheckNote : '**还原失败**：sha256 与备份不一致'),
    evidence: evidenceLine(r.out, d.expectNamed) + recheckEvidence,
  }
}

/** `criterion` / `note` 的规范化（未标 = `unspecified`，由覆盖度用例拦住新条目漏标）。 */
function criterionOf(d: { criterion?: 'behavior' | 'source-anchor'; note?: string }): { criterion: Result['criterion']; note?: string } {
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

/* ── archive 组的定制执行器（RV-1 桩提交 / RV-3 台账副本只读核对）─────────────── */

/** 真台账根单点：`<DSH_HOME|~/.dsh>/reqboard`（与 kb-probe / archive-ledger-audit 同款口径）。 */
function ledgerRootPath(): string {
  const home = process.env['DSH_HOME']
  return join(home !== undefined && home.length > 0 ? home : join(homedir(), '.dsh'), 'reqboard')
}

/** 定制执行器的产出（由 `runArchiveCustomDrill` 收敛成 `Result` 的公共面）。 */
interface CustomOutcome {
  /** 0 = 判据成立（与既有条目"判据红 → 1"的语义相反，见各执行器注释） */
  exit: number
  restored: boolean
  missingNamed: string[]
  restoreNote: string
  evidence: string
  cmd: string
  /** 逐步读数（人读；会并进 `evidence`，**不新增 Result 字段**，--json 形状不变） */
  transcript: string[]
}

/** `ArchiveDrill` 的 `file` 条目 → 执行器最小面（缺 target/from/to 直接抛：宁可响亮报错，不静默跳过）。 */
function mutateSpecOf(d: ArchiveDrill): MutateSpec {
  const { target, from, to } = d
  if (target === undefined || from === undefined || to === undefined) {
    throw new Error('[' + d.ref + '] mode=file 的 archive 条目缺 target/from/to')
  }
  return { ...d, target, from, to }
}

/**
 * RV-1：桩工作区 + 内存 store 上跑**真的** `SubmitArchive` 闸
 * （与 `tests/archive-targets-gate.test.ts` ①③ 同源场景，但不进 vitest：验收要一条命令跑完）。
 *
 * 为什么是"桩工作区 + 内存 store"而不是真台账：本演练要证的是「不存在的 `merged_into` 必被拒」，
 * 与被拒对象无关；用内存 store + mktemp 桩工作区 ⇒ **真台账 / 真工作区一个字节都不参与**，
 * 演练可反复跑、**不依赖真台账可写**（F-1 那类"写成功却报失败"的存量缺陷也不会被本演练触发）。
 * "被改坏的文件" = 桩工作区里的提交材料 `submit-materials.json`：
 * 改坏（`merged_into` → 不存在的路径）→ 提交被拒且点名三要素 → 从字节备份还原 → sha256 比对 →
 * **同一次提交通过**（=`还原`不是口头声明）。
 */
async function runRv1(d: ArchiveDrill, work: string): Promise<CustomOutcome> {
  const stub = join(work, 'rv1-stub-workspace')
  const transcript: string[] = []
  const missing: string[] = []
  const W = 'drill-archive-rv1'
  // 目录/需求 id 必须过 `REQUIREMENT_DIR_PATTERN`（`REQ-` + 6 位小写 hex），否则会在"需求目录约定"
  // 这一层就被拒——那样测到的是目录形态，不是本演练要考的合并去向闸（实测踩过：REQ-rv1drill 被拒）。
  const REQ_ID = 'REQ-d1a001'
  const DIR = 'docs/requirements/' + REQ_ID
  const MANUAL = 'docs/architecture/project-manual.md'
  const MANUAL_MD = '# 项目说明书\n\n## 收尾门\n\n收尾门三条硬约束。\n'
  const materialsPath = join(stub, 'submit-materials.json')
  let restored = false
  let restoreNote = '**未走到还原**（前面任一步抛错）'
  let evidence = '（未跑）'
  try {
    mkdirSync(stub, { recursive: true })
    const [{ makeTestStore }, { defineArchiveSubmitTool, stubDocFile }, { listHeadingAnchors }] =
      await Promise.all([
        import('../tests/application/harness.js'),
        import('../tests/helpers/tool-deps.js'),
        import('../src/domain/knowledge/slug.js'),
      ])
    // 锚点由**同一实现**算出（不手写 slug 规则，与既有用例同源）。
    const anchors = listHeadingAnchors(MANUAL_MD)
    const anchor = anchors[anchors.length - 1]!.anchor
    for (const p of ['requirement.md', 'decomposition.md', 'verification.md']) {
      stubDocFile(DIR + '/' + p, stub)
    }
    stubDocFile(MANUAL, stub, MANUAL_MD)
    const store = makeTestStore()
    await store.replaceAll('rv1-drill-seed', {
      schemaVersion: 9, revision: 0, triages: [],
      requirements: [{
        id: REQ_ID, title: 'RV-1 桩需求', description: '', status: 'archived', blocked: false,
        category: 'feature', sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
        createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
        statusHistory: [{ status: 'archived', at: 1, by: { kind: 'human' } }],
        workspaceRoot: stub,
      }],
    } as never)

    const tool = defineArchiveSubmitTool(
      { store, now: () => Date.now(), workspaceRoot: stub } as never,
    ) as { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }
    /** 每次提交都**从盘上重读**材料文件：还原只有落在盘上才算数（内存里另留一份不算）。 */
    const submitFromFile = async (): Promise<{ ok: boolean; message: string; out?: Record<string, unknown> }> => {
      const args = JSON.parse(readFileSync(materialsPath, 'utf8')) as Record<string, unknown>
      try {
        return { ok: true, message: '', out: await tool.execute(args, { agent: { id: W } }) }
      } catch (err) {
        return { ok: false, message: (err as Error).message }
      }
    }

    const good = {
      dir: DIR,
      docs: [
        { kind: 'requirement', path: DIR + '/requirement.md' },
        { kind: 'plan', path: DIR + '/decomposition.md' },
        { kind: 'verification', path: DIR + '/verification.md' },
      ],
      merged_into: [MANUAL],
      index_entry: 'RV-1 桩提交：逐字节还原后同一次提交必须通过',
      manual_updates: [{ path: MANUAL + '#' + anchor, summary: 'RV-1 桩材料' }],
    }
    const goodBytes = Buffer.from(JSON.stringify(good, null, 2) + '\n', 'utf8')
    writeFileSync(materialsPath, goodBytes)
    const goodHash = sha(materialsPath)
    // 改坏点：仅把合并去向换成盘上不存在的路径（其余材料一字不动 ⇒ 拒绝只可能来自这一处）。
    writeFileSync(materialsPath, JSON.stringify({ ...good, merged_into: [RV1_BAD_TARGET] }, null, 2) + '\n')
    const badHash = sha(materialsPath)
    transcript.push('桩工作区（mktemp，跑完删除）：' + stub)
    transcript.push('被改坏的文件：' + materialsPath)
    transcript.push('改坏前 sha256：' + goodHash)
    transcript.push('改坏后 sha256：' + badHash)

    const rejected = await submitFromFile()
    transcript.push('【改坏态】提交：' + (rejected.ok ? '**意外通过**（应为拒绝）' : '被拒（预期）'))
    transcript.push('【改坏态】拒绝消息：' + rejected.message)
    evidence = '拒绝消息：' + rejected.message.slice(0, 300)
    if (rejected.ok) missing.push('期望被拒，实际通过：merged_into=' + RV1_BAD_TARGET + ' 未被拦')
    for (const frag of d.expectNamed) if (!rejected.message.includes(frag)) missing.push(frag)
    // 生效根是**动态**的（mktemp 路径），不能写进 expectNamed ⇒ 这里显式核，核不到就是没点名。
    if (!rejected.message.includes(stub)) {
      missing.push('生效根（桩工作区 ' + stub + '）未出现在拒绝消息里')
    }

    writeFileSync(materialsPath, goodBytes)
    const restoredHash = sha(materialsPath)
    restored = restoredHash === goodHash
    transcript.push('还原后 sha256：' + restoredHash + (restored ? '（与改坏前一致 ✅）' : '（**不一致** ❌）'))
    restoreNote = restored
      ? '已逐字节还原 ' + materialsPath + '（sha256 ' + goodHash.slice(0, 12) + '… 与改坏前一致）'
      : '**还原失败**：还原后 sha256 ' + restoredHash.slice(0, 12) + '… ≠ 备份 ' + goodHash.slice(0, 12) + '…'

    if (restored) {
      const passed = await submitFromFile()
      const ok = passed.ok && passed.out?.['success'] === true
      transcript.push('【还原态】同一次提交：' + (ok ? '通过（success=true）' : '未通过'))
      evidence += ' ｜ 逐字节还原后同一次提交：' + (ok ? '通过' : '未通过（' + passed.message.slice(0, 120) + '）')
      if (!ok) missing.push('逐字节还原后同一次提交未通过：' + (passed.message.slice(0, 120) || 'success != true'))
    }
    transcript.push('真台账未被使用：store = 内存 store（tests/application/harness.ts 的 makeTestStore），'
      + '桩工作区在 mktemp 下、跑完删除 ⇒ 本演练不依赖真台账可写')
  } finally {
    rmSync(stub, { recursive: true, force: true })
  }
  return {
    exit: missing.length === 0 ? 0 : 1,
    restored, missingNamed: missing, restoreNote, evidence,
    cmd: d.cmd.join(' '), transcript,
  }
}

/**
 * RV-3：真台账**副本**上跑只读核对，逐条核对七项读数 + 两棵树的 sha256 + "副本之外零新增文件"。
 *
 * 只读契约怎么证：① 副本树 sha256 前后一致（审计脚本除 `--out` 外不写任何路径，本演练**不传** `--out`）；
 * ② 真台账树 sha256 前后一致（演练只读真台账、只写副本）；③ 副本所在临时目录里除副本外零新增文件。
 * 读数对不上 = 判红：那是时点漂移（别的窗口又归档一条 / 改了说明书）或判据真坏了，
 * **由人分因**并走裁定——演练绝不为了让读数对上而改 `RV3_EXPECTED_TOTALS`。
 */
function runRv3(d: ArchiveDrill, work: string): CustomOutcome {
  const transcript: string[] = []
  const missing: string[] = []
  const src = ledgerRootPath()
  const cmdLine = d.cmd.join(' ')
  if (!existsSync(src)) {
    return {
      exit: 1, restored: false,
      missingNamed: ['台账不可达 ' + src + '（RV-3 取不到读数，不判绿——"没有数据"≠"没问题"）'],
      restoreNote: '未拷贝（台账不可达）',
      evidence: '台账不可达：' + src,
      cmd: cmdLine, transcript,
    }
  }
  const rv3Work = join(work, 'rv3-work')
  mkdirSync(rv3Work, { recursive: true })
  const copy = join(rv3Work, 'ledger-copy')
  cpSync(src, copy, { recursive: true })
  const srcBefore = fingerprint(src)
  const copyBefore = fingerprint(copy)

  const r = runCommand(['npx', 'tsx', 'scripts/archive-ledger-audit.mts', '--ledger-root', copy, '--json'])
  const cmd = cmdLine.replace('<副本>', copy)
  if (r.exit !== 0) missing.push('审计脚本退出码 ' + String(r.exit) + '（期望 0 = 报告完成；2 = 台账不可达）')
  const start = r.out.indexOf('{')
  const end = r.out.lastIndexOf('}')
  let totals: Record<string, unknown> = {}
  if (start < 0 || end <= start) {
    missing.push('审计输出里没有 JSON 对象（前 200 字符：' + r.out.slice(0, 200) + '）')
  } else {
    try {
      totals = ((JSON.parse(r.out.slice(start, end + 1)) as { totals?: Record<string, unknown> }).totals) ?? {}
    } catch (err) {
      missing.push('审计输出 JSON 解析失败：' + (err as Error).message)
    }
  }
  for (const [key, expected] of RV3_EXPECTED_TOTALS) {
    const actual = totals[key]
    const ok = actual === expected
    transcript.push('读数 ' + key + ' = ' + String(actual) + '（期望 ' + String(expected) + '）' + (ok ? ' ✅' : ' ❌'))
    if (!ok) missing.push('读数 ' + key + ' 期望 ' + String(expected) + '、实测 ' + String(actual))
  }

  const copyAfter = fingerprint(copy)
  const srcAfter = fingerprint(src)
  const copyUnchanged = copyAfter === copyBefore
  const srcUnchanged = srcAfter === srcBefore
  const strays = readdirSync(rv3Work).filter(n => n !== 'ledger-copy')
  if (!copyUnchanged) missing.push('副本树 sha256 变了（只读契约被破坏）')
  if (!srcUnchanged) missing.push('真台账树 sha256 变了（本演练绝不写真台账；先查是不是别的窗口在写）')
  if (strays.length > 0) missing.push('副本之外出现新写入：' + strays.join('、'))
  transcript.push('副本树 sha256：' + copyBefore + ' → ' + copyAfter + (copyUnchanged ? '（未变 ✅）' : '（**变了** ❌）'))
  transcript.push('真台账树 sha256：' + srcBefore + ' → ' + srcAfter + (srcUnchanged ? '（未变 ✅）' : '（**变了** ❌）'))
  transcript.push('副本之外的新增文件：' + (strays.length === 0 ? '无 ✅' : strays.join('、') + ' ❌'))
  transcript.push('台账根：' + src + '；副本：' + copy + '（跑完随临时根删除）')

  const restored = copyUnchanged && srcUnchanged
  return {
    exit: missing.length === 0 ? 0 : 1,
    restored, missingNamed: missing,
    restoreNote: restored
      ? '副本与真台账两棵树 sha256 前后逐字节一致 ⇒ 只读契约成立（本演练不传 `--out`，除副本外零写入）'
      : '**有树被改写**：副本或真台账的 sha256 前后不一致，请人工核查',
    evidence: RV3_EXPECTED_TOTALS.map(([k]) => k + '=' + String(totals[k])).join(' / ')
      + ' ｜ 真台账树 sha256 ' + srcBefore.slice(0, 12) + '…（前后未变）'
      + ' ｜ 时点 ' + new Date().toISOString(),
    cmd, transcript,
  }
}

/** 定制执行器的分发 + 收敛成 `Result`（`transcript` 并进 `evidence`，不新增字段）。 */
async function runArchiveCustomDrill(d: ArchiveDrill, work: string): Promise<Omit<Result, 'ok'>> {
  const out = d.mode === 'rv1' ? await runRv1(d, work) : runRv3(d, work)
  return {
    group: d.group, ref: d.ref, name: d.name, required: false,
    ...criterionOf(d),
    breakPoint: d.breakPoint, cmd: out.cmd, exit: out.exit, expectExit: d.expectExit,
    red: 0, minRed: d.minRed ?? 0,
    missingNamed: out.missingNamed, restored: out.restored, anchorMiss: false,
    restoreNote: out.restoreNote,
    evidence: out.evidence
      + (out.transcript.length === 0 ? '' : '\n' + out.transcript.map(l => '       · ' + l).join('\n')),
  }
}

/** 一条演练的执行分发：`archive` 组的 RV-1/RV-3 走定制执行器，其余一律走既有两个执行器。 */
async function runDrill(d: Drill | ArchiveDrill, work: string): Promise<Omit<Result, 'ok'>> {
  if (d.group === 'archive') {
    return d.mode === 'file' ? runFileDrill(mutateSpecOf(d)) : await runArchiveCustomDrill(d, work)
  }
  return d.mode === 'copy' ? runCopyDrill(d, work) : runFileDrill(d)
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const gi = argv.indexOf('--group')
  const group = gi >= 0 ? (argv[gi + 1] ?? '') : 'hard'
  // 组名表：`'canceled', 'all'` 必须**保持相邻**（tests/canceled-reverse-drill-coverage.test.ts ⑦ 逐字断言）。
  if (!['hard', 'legacy', 'archive', 'canceled', 'all'].includes(group)) {
    console.error('用法：npx tsx scripts/reverse-drill-matrix.mts [--json] '
      + '[--group hard|legacy|archive|canceled|all]')
    process.exit(2)
  }
  const drills: readonly (Drill | ArchiveDrill)[] = group === 'all'
    ? [...HARD_DRILLS, ...LEGACY_DRILLS, ...CANCELED_DRILLS]
    : group === 'archive'
      ? ARCHIVE_DRILLS
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
      const raw = await runDrill(d, work)
      const r = judge(raw)
      results.push(r)
      // 锚点未命中 = 演练无效（没写盘），继续把余下条目跑完，别让一条错锚点掩住其余问题；
      // 还原失败 / 并发写入才是**立刻中止**（绝不带着半改状态继续跑下一项）。
      if (!r.restored && !r.anchorMiss) {
        console.error('[中止] ' + String(d.target ?? d.ref) + ' ' + r.restoreNote + '，停止后续演练。')
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
  console.log('组：' + group + '（hard = REQ-261005105032-3b02 六条必备 + 附一条 + 缺口 2 设计坐标一条；'
    + 'legacy = REQ-261004065652-5c1c 六条；canceled = REQ-261005193546-1b1a 十四条；'
    + 'archive = REQ-261006201841-944d 三条 RV-1/RV-2/RV-3）')
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
  if (group === 'archive') {
    console.log('\narchive 组：' + String(results.length)
      + ' 条（RV-1 桩提交被拒 + 材料逐字节还原后同一次提交通过 / RV-2 删 K13 分支即时红 + 还原后复绿 / '
      + 'RV-3 台账副本七项读数 + 副本与真台账两棵树 sha256 未变）')
    console.log('（本组**不进** `--group all`：RV-3 会拷真台账、RV-2 会 spawn vitest，'
      + '并进 all 会让"三组都跑"多出对用户本机真台账内容的依赖）')
  }
  console.log(allOk
    ? (group === 'archive'
      ? '\n[通过] archive 组三条判据全部成立（RV-1 被拒并点名三要素 + 材料逐字节还原后同一次提交通过；'
        + 'RV-2 删 K13 分支即时红、还原后复绿；RV-3 台账副本七项读数对上 + 两棵树 sha256 未变）。'
      : '\n[通过] 所选组全部演练如预期变红，且每一处的还原都过了 sha256 核对。')
    : '\n[失败] 有演练没变红 / 没点名 / 锚点未命中 / 还原失败——不得宣称判据有效。')
  if (!allOk) process.exitCode = 1
}

// vitest 会 import 本模块（覆盖度用例读 CANCELED_DRILLS），此时**不得**跑 main()——
// 否则一条只读用例会真的去改工作区源码。`VITEST` 由 vitest 注入；命令行跑（tsx / node）时没有它。
if (process.env.VITEST === undefined) main()

