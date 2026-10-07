/**
 * 原型对齐判据（REQ-261006201649-cc89 FR-5）——「实现 == 设计契约」的**可参数化**机器判据。
 *
 * ## 为什么需要它（这份判据的来历）
 *
 * `tests/prototype-parity.test.ts` 原本是**某一条需求专属的靶子**（194 行手写断言，文件头自述：
 * 「四张前端卡的测试只断言了文案与行为，没有一条断言视觉结构——于是每张卡都绿，界面却不是原型那个样子」）。
 * 那条靶子有效，但它**不可复用**：新需求要么再手写一份、要么干脆不写。实测代价是清楚的——
 * 15 条有原型的需求里只有 4 条在验收单上真的对照过。
 *
 * 本模块把那条靶子的**形状**抽出来，做成"给定配置就能跑"的判据：被检需求只提供
 * 三组契约（类名 / `data-*` / DOM 顺序）+ 原型路径，其余全在这里。
 *
 * ## 纪律：判据只许"读原型、量实现"，**禁止由实现反推原型**
 *
 * 见 `docs/architecture/project-manual.md` 机制备忘（2026-10-05）。本模块是纯函数：
 * 输入是**两份 HTML 字符串**，输出是违规清单——它没有任何"生成原型"的能力，
 * 也不读盘（配置与文件读取由调用方在 `tests/` 侧完成，见下）。
 *
 * ## 纯函数与零依赖
 *
 * domain 层纪律：不 import `node:`、不碰时间与随机数、不引 HTML 解析库。判据只做
 * 子串定位与单调递增检查——**够用且可解释**：判错了人一眼能看出为什么。
 *
 * @module dsh-pmboard/domain/prototype/ParityContracts
 */

/** 契约项：裸名，或「名字 + 实现侧记号」两项形态。 */
export type ContractItem = string | readonly [string, string]

/**
 * 三组契约。
 *
 * 为什么 `order` 允许 `[显示名, 记号]`：原型里常见的写法是语义顺序（`a → b → c`）而不是
 * 可定位的标记——只按名字在实现里找必然找不到，于是"顺序"这一维会静默退化成"不判"。
 * 两元形态让人把"这个顺序名对应实现里的哪个字符串"写清楚，判据才有东西可量。
 */
export interface ParityContracts {
  /** 类名：每一项必须在实现 HTML 里出现（子串命中，复合类也算） */
  classes: readonly ContractItem[]
  /**
   * `data-*` 契约。三种写法：
   *   · `data-x`            —— 只判属性名存在；
   *   · `data-x=a|b|c`      —— 判属性存在**且**取值落在值域内（取第一个值断言，值域用于人读）；
   *   · `[data-x, 记号]`    —— 判记号在实现里出现（用于原型侧属性名与实现不同的既有偏差）。
   */
  dataAttrs: readonly ContractItem[]
  /** DOM 顺序：按数组顺序在实现 HTML 里做**单调递增**定位（前一项出现位置必须早于后一项） */
  order: readonly ContractItem[]
}

/** 一条契约违规（人读；每条必须能独立定位）。 */
export interface ParityViolation {
  contract: 'classes' | 'dataAttrs' | 'order'
  expected: string
  actual: string
  /** 原型锚点（如 `prototypes/detail.html#FR-2`），供"回原型看" */
  anchor: string
}

/** 契约项拆成 [名字, 记号]：裸名 → 记号就是它自己。 */
function splitItem(item: ContractItem): readonly [string, string] {
  return typeof item === 'string' ? [item, item] : item
}

/** 定位记号在文本里的下标；找不到 → -1。 */
function at(text: string, token: string): number {
  return text.indexOf(token)
}

/** 转义正则元字符（值域用 `|` 分隔，其余按字面量）。 */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `data-x=a|b|c` 的形态拆解：属性名 + 值域（无 `=` 时值域为空）。
 * 属性名必须是 `data-` 开头且非空；否则视为形态非法（**响亮报出**，不静默当"没有这一项"）。
 */
function splitDataAttr(spec: string): { name: string; values: string[] } | undefined {
  const eq = spec.indexOf('=')
  const name = (eq < 0 ? spec : spec.slice(0, eq)).trim()
  if (!/^data-[a-z0-9-]+$/i.test(name)) return undefined
  const values = eq < 0 ? [] : spec.slice(eq + 1).split('|').map(v => v.trim()).filter(v => v.length > 0)
  return { name, values }
}

/**
 * 判据本体：返回**全部**违规（不是首个即停）。
 *
 * 为什么要一次给全：人改了第一条才看到第二条，是"反复返工"的经典成因；
 * 除非存在**后续判定依赖前一条结果**的关系（本判据没有），一次给全更省人。
 *
 * @param prototypeHtml 权威原型的正文（只用于**写进违规里当锚点上下文**，不参与判定基线计算）
 * @param implHtml      实现渲染出的 HTML（被量的一方）
 * @param contracts     三组契约
 * @param prototypeRef  原型引用（`prototypes/<name>.html#FR-N`），逐条违规都带上它
 */
export function prototypeParityViolations(
  prototypeHtml: string,
  implHtml: string,
  contracts: ParityContracts,
  prototypeRef: string,
): ParityViolation[] {
  const out: ParityViolation[] = []
  const anchor = prototypeRef

  // ── ① class 契约 ──────────────────────────────────────────────────────────
  for (const raw of contracts.classes) {
    const [name, token] = splitItem(raw)
    if (name.trim() === '') {
      out.push({ contract: 'classes', expected: name, actual: '（契约项为空）', anchor })
      continue
    }
    if (at(implHtml, token) < 0) {
      const inPrototype = at(prototypeHtml, name) >= 0
      out.push({
        contract: 'classes',
        expected: name,
        actual: inPrototype
          ? '实现里找不到（原型里有）'
          : '实现里找不到',
        anchor,
      })
    }
  }

  // ── ② data-* 契约 ─────────────────────────────────────────────────────────
  // 分派口径：**是不是数组**决定形态（数组 = [契约名, 记号]；字符串 = data-* 规格）。
  // 为什么不用"第一项像不像 data-*"来判（试过，被用例否掉）：
  // 那样 `'aria-x=1'` 这种**真·形态非法**的裸字符串会被当成"契约名"、判定落到第二项（= 它自己），
  // 于是"形态非法"这条响亮失败被降级成"实现里找不到记号 aria-x=1"——病因写错了。
  for (const raw of contracts.dataAttrs) {
    const [name, token] = splitItem(raw)
    if (Array.isArray(raw)) {
      if (at(implHtml, token) < 0) {
        out.push({ contract: 'dataAttrs', expected: name, actual: '实现里找不到记号 ' + token, anchor })
      }
      continue
    }
    const spec = splitDataAttr(name)
    if (spec === undefined) {
      out.push({ contract: 'dataAttrs', expected: name, actual: '契约形态非法（须以 data- 开头）', anchor })
      continue
    }
    const nameAt = at(implHtml, spec.name)
    if (nameAt < 0) {
      out.push({ contract: 'dataAttrs', expected: name, actual: '实现里没有这条属性', anchor })
      continue
    }
    if (spec.values.length === 0) continue
    // 取值域：属性名之后的那段里，值必须落在域内（不跨标签找，避免把邻元素的属性误当本属性的值）
    const after = implHtml.slice(nameAt, nameAt + 400)
    const m = /=\s*"([^"]*)"/.exec(after)
    const got = m?.[1]
    if (got === undefined) {
      out.push({ contract: 'dataAttrs', expected: name, actual: '属性没有取值', anchor })
      continue
    }
    const allowed = new RegExp('^(?:' + spec.values.map(escapeRe).join('|') + ')$')
    if (!allowed.test(got)) {
      out.push({ contract: 'dataAttrs', expected: name, actual: '实际取值 ' + got, anchor })
    }
  }

  // ── ③ DOM 顺序契约 ────────────────────────────────────────────────────────
  // 判据：按声明顺序逐项定位，位置必须**严格递增**（允许中间隔着别的节点——那是实现自由）。
  // ⚠️ 任一项找不到 = 违规（**不许静默跳过**）：跳过会让"顺序"这一维在部件缺失时假装通过。
  let prevName = ''
  let prevPos = -1
  for (const raw of contracts.order) {
    const [name, token] = splitItem(raw)
    const pos = at(implHtml, token)
    if (pos < 0) {
      out.push({
        contract: 'order',
        expected: prevName === '' ? name + '（顺序首项）' : prevName + ' → ' + name,
        actual: '实现里找不到 ' + token,
        anchor,
      })
      continue
    }
    if (prevPos >= 0 && pos < prevPos) {
      out.push({
        contract: 'order',
        expected: prevName + ' 出现在 ' + name + ' 之前',
        actual: name + ' 出现在 ' + prevName + ' 之前（顺序颠倒）',
        anchor,
      })
    }
    prevName = name
    prevPos = pos
  }

  return out
}

/** 违规清单 → 人读摘要（报告与失败消息共用一份措辞）。 */
export function formatParityViolations(violations: readonly ParityViolation[]): string {
  if (violations.length === 0) return '无违规'
  return violations
    .map(v => '[' + v.contract + '] ' + v.expected + '：' + v.actual + '（原型 ' + v.anchor + '）')
    .join('\n')
}
