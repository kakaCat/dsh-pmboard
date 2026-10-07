/**
 * 降级原因字段的契约镜像门禁（REQ-261007160829-1991 · design/test-cases.md TC-7）serves: FR-2
 *
 * 本卡只做**机械断言**：把「两处镜像不许漂」与「该字段是可选」变成会红的用例（不含实现）。
 *
 * 被钉住的两处声明（`VerificationItem.unverifiedReason` 与 `SheetItemLike.unverifiedReason`）：
 * 协议层 `src/shared/protocol.ts` **禁止**被 domain import（layer-boundary），故只能成对镜像声明；
 * 而镜像的失效形态正是「有人只改了一侧」或「有人把它升级成必填而无人察觉」——两条都在下面。
 *
 * 三条断言与 TC-7 的判据逐条对应：
 *   ① **同名同值域**：两侧字段类型精确相等，并用**双向互赋值**再证一遍（任一侧改名 / 改值域即 tsc 红）；
 *   ② **值域只有两个字面量**：`'blank_pass' | 'anchor_missing'`——用类型断言覆盖（不是只写运行时 `expect`）；
 *   ③ **可选**：不带该字段的合法对象必须通过类型检查，且它**不在**任何「必填字段清单」类常量里。
 *
 * 关于 ③ 的取值路径（写明我查了哪些地方、结论是什么）：
 *   · 仓内**没有**面向 `VerificationItem` / `SheetItemLike` 的必填清单。我按
 *     `REQUIRED_\w*FIELDS` / `REQUIRED_FIELDS` / `requiredFields` / `必填字段` 在 `src/**` 里查过，
 *     命中的清单类常量只有 `src/domain/queue/validateQueue.ts` 的 `REQUIRED_TASK_FIELDS`（TaskRecord 级）
 *     与 `REQUIRED_TOP_LEVEL_FIELDS`（队列文件级）——两者都不是验收项的清单，也不含本字段；
 *     其余命中是注释（protocol.ts）与运行期报错文案（knowledge/entry.ts）。
 *   · 故按 TC-7 注明的兜底口径做两件事：**读源文字面量**断言两个清单里没有 `unverifiedReason`
 *     （附反向自检，防抽错位置造成假绿；并断言整个 validateQueue.ts 都不提这个字段）
 *     ＋ **断言两处声明里该字段都带 `?`**。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { VerificationItem } from '../src/shared/protocol.js'
import type { SheetItemLike, UnverifiedReason } from '../src/domain/workflow/AcceptanceSheetSpec.js'

const PROTOCOL_SRC = fileURLToPath(new URL('../src/shared/protocol.ts', import.meta.url))
const SHEET_SPEC_SRC = fileURLToPath(new URL('../src/domain/workflow/AcceptanceSheetSpec.ts', import.meta.url))
const VALIDATE_QUEUE_SRC = fileURLToPath(new URL('../src/domain/queue/validateQueue.ts', import.meta.url))

/** 抹掉注释（`/* *\/` 与 `//`）：源码级断言只断**代码**，注释里的留档不算数。 */
function stripComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')
}

/**
 * 取 `interface X { ... }` 的**接口体原文**（按花括号配对，先 strip 注释以免注释里的括号干扰）。
 * 抽不到 = 响亮抛错（**不返回空串**：空串会让 `not.toContain` 恒真 ⇒ 假绿）。
 */
function interfaceBodyOf(src: string, marker: string): string {
  const code = stripComments(src)
  const decl = code.indexOf(marker)
  if (decl < 0) throw new Error('抽不到声明：' + marker)
  const open = code.indexOf('{', decl)
  if (open < 0) throw new Error('抽不到接口体起始：' + marker)
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth += 1
    else if (code[i] === '}') {
      depth -= 1
      if (depth === 0) return code.slice(open + 1, i)
    }
  }
  throw new Error('接口体没有闭合：' + marker)
}

/** 抽出 `src` 里 `declMarker` 声明**赋值**的那个 `[...]` 字面量原文（与 tests/contract-types.test.ts 同口径）。 */
function literalOf(src: string, declMarker: string): string {
  const decl = src.indexOf(declMarker)
  if (decl < 0) throw new Error('抽不到声明：' + declMarker)
  const open = src.indexOf('= [', decl)
  if (open < 0) throw new Error('抽不到赋值处的数组字面量：' + declMarker)
  let depth = 0
  for (let i = open + 2; i < src.length; i++) {
    if (src[i] === '[') depth += 1
    else if (src[i] === ']') {
      depth -= 1
      if (depth === 0) return src.slice(open + 2, i + 1)
    }
  }
  throw new Error('数组字面量没有闭合：' + declMarker)
}

/**
 * 编译期双向赋值证明：两侧字段类型互换赋值。
 * 任一侧改名 / 改值域（哪怕只多一个值）→ `pnpm typecheck` 在这一行报错。
 * 之所以写成函数而不是裸赋值语句：`noUnusedLocals` 下裸变量会被判未使用，函数则在用例里真跑一次。
 */
function mirrorAssignability(
  protocolReason: VerificationItem['unverifiedReason'],
  sheetReason: SheetItemLike['unverifiedReason'],
): [SheetItemLike['unverifiedReason'], VerificationItem['unverifiedReason']] {
  const toSheet: SheetItemLike['unverifiedReason'] = protocolReason // protocol → domain
  const toProtocol: VerificationItem['unverifiedReason'] = sheetReason // domain → protocol
  return [toSheet, toProtocol]
}

/** 受控两值（顺序固定，供「覆盖到每个字面量」的用例遍历）。 */
const REASONS: readonly UnverifiedReason[] = ['blank_pass', 'anchor_missing']

/**
 * 编译期「每个字面量都能落到两侧字段上」：入参是受控联合，返回值是两侧的字段类型。
 * 某个取值被从值域里删掉 / 某侧字段改窄 → tsc 在这里报错（不是运行期才发现）。
 */
function acceptsBothLiterals(
  reason: UnverifiedReason,
): [VerificationItem['unverifiedReason'], SheetItemLike['unverifiedReason']] {
  return [reason, reason]
}

/**
 * 「不带 `unverifiedReason` 的合法对象」——**这就是可选性的编译期判据**：
 * 若该字段被升级成必填（去掉 `?`），这两处字面量在本文件就编译不过（tsc 红），而不是运行期才发现。
 */
const ITEM_WITHOUT_REASON: VerificationItem = {
  id: 'v1-1',
  source: { kind: 'requirement' },
  criterion: '无该字段也要能构造（老数据形态）',
  evidence: [],
  status: 'unverified',
}

const SHEET_ITEM_WITHOUT_REASON: SheetItemLike = {
  id: 'v1-1',
  source: { kind: 'requirement' },
  criterion: '无该字段也要能构造（老数据形态）',
  evidence: [],
  status: 'unverified',
}

describe('TC-7 ① 镜像一致：protocol.VerificationItem ↔ SheetItemLike（同名同值域）', () => {
  it('类型层精确相等（eq 是双向的：只改一侧即红）', () => {
    expectTypeOf<VerificationItem['unverifiedReason']>().toEqualTypeOf<SheetItemLike['unverifiedReason']>()
    // 两侧都等于「受控两值 ∪ undefined」——值域漂移（多值 / 少值 / 改字面量）也一并钉住
    expectTypeOf<VerificationItem['unverifiedReason']>().toEqualTypeOf<UnverifiedReason | undefined>()
    expectTypeOf<SheetItemLike['unverifiedReason']>().toEqualTypeOf<UnverifiedReason | undefined>()
  })

  it('编译期双向互赋值（protocol → domain 与 domain → protocol 都必须成立）', () => {
    expect(mirrorAssignability(undefined, 'anchor_missing')).toEqual([undefined, 'anchor_missing'])
    expect(mirrorAssignability('blank_pass', undefined)).toEqual(['blank_pass', undefined])
    for (const reason of REASONS) {
      expect(mirrorAssignability(reason, reason)).toEqual([reason, reason])
    }
  })

  it('字段名逐字一致：两处声明都是 unverifiedReason（拼写漂移即红）', () => {
    const protocolBody = interfaceBodyOf(readFileSync(PROTOCOL_SRC, 'utf8'), 'export interface VerificationItem')
    const sheetBody = interfaceBodyOf(readFileSync(SHEET_SPEC_SRC, 'utf8'), 'export interface SheetItemLike')
    // 反向自检：抽到的确实是那两份接口体（首项在场），否则下面的断言可能对着空串成立
    expect(protocolBody).toContain('criterion')
    expect(protocolBody).toContain('status')
    expect(sheetBody).toContain('criterion')
    expect(sheetBody).toContain('status')
    expect(protocolBody).toMatch(/\bunverifiedReason\?/)
    expect(sheetBody).toMatch(/\bunverifiedReason\?/)
  })

  it('两处声明互相点名对方文件（删掉镜像说明即红：镜像关系必须是**写下来**的）', () => {
    const protocolRaw = readFileSync(PROTOCOL_SRC, 'utf8')
    const sheetRaw = readFileSync(SHEET_SPEC_SRC, 'utf8')
    expect(protocolRaw).toMatch(/域层镜像见[\s\S]{0,80}AcceptanceSheetSpec\.ts[\s\S]{0,40}SheetItemLike/)
    expect(sheetRaw).toMatch(/protocol\.ts[\s\S]{0,80}VerificationItem[\s\S]{0,120}成对镜像/)
  })
})

describe('TC-7 ② 值域只有两个字面量（类型断言，非运行时 expect）', () => {
  it('UnverifiedReason 精确等于两值联合：多一个值 / 少一个值都红', () => {
    expectTypeOf<UnverifiedReason>().toEqualTypeOf<'blank_pass' | 'anchor_missing'>()
    expectTypeOf<UnverifiedReason>().not.toEqualTypeOf<'blank_pass' | 'anchor_missing' | 'other'>()
    expectTypeOf<UnverifiedReason>().not.toEqualTypeOf<'blank_pass'>()
  })

  it('两个字面量各自都能落到两侧字段上（每个取值都被覆盖到）', () => {
    expect(acceptsBothLiterals('blank_pass')).toEqual(['blank_pass', 'blank_pass'])
    expect(acceptsBothLiterals('anchor_missing')).toEqual(['anchor_missing', 'anchor_missing'])

    const protocolItems: VerificationItem[] = REASONS.map(reason => ({ ...ITEM_WITHOUT_REASON, unverifiedReason: reason }))
    const sheetItems: SheetItemLike[] = REASONS.map(reason => ({ ...SHEET_ITEM_WITHOUT_REASON, unverifiedReason: reason }))
    const seen = (xs: readonly { unverifiedReason?: UnverifiedReason }[]) => xs.map(x => x.unverifiedReason)
    expect(seen(protocolItems)).toEqual(['blank_pass', 'anchor_missing'])
    expect(seen(sheetItems)).toEqual(['blank_pass', 'anchor_missing'])
  })

  it('单点声明的源文字面量就是那两个值（受控枚举不许长第三个值）', () => {
    const spec = stripComments(readFileSync(SHEET_SPEC_SRC, 'utf8'))
    expect(spec).toMatch(/export type UnverifiedReason = 'blank_pass' \| 'anchor_missing'/)
  })
})

describe('TC-7 ③ 可选：不在任何必填清单里（老数据缺席合法）', () => {
  it('运行期：不带该字段的合法对象读出 undefined，且键不存在（不是 null / 不是 0）', () => {
    expect('unverifiedReason' in ITEM_WITHOUT_REASON).toBe(false)
    expect(ITEM_WITHOUT_REASON.unverifiedReason).toBeUndefined()
    expect('unverifiedReason' in SHEET_ITEM_WITHOUT_REASON).toBe(false)
    expect(SHEET_ITEM_WITHOUT_REASON.unverifiedReason).toBeUndefined()
  })

  it('源码级：两处声明都带 `?`（被升级成必填即红）', () => {
    const protocolBody = interfaceBodyOf(readFileSync(PROTOCOL_SRC, 'utf8'), 'export interface VerificationItem')
    const sheetBody = interfaceBodyOf(readFileSync(SHEET_SPEC_SRC, 'utf8'), 'export interface SheetItemLike')
    expect(protocolBody).toMatch(/unverifiedReason\?/)
    expect(sheetBody).toMatch(/unverifiedReason\?/)
    // 反向：不许出现「无 `?` 的声明」（`unverifiedReason\s*:` 不会命中 `unverifiedReason?:`）
    expect(protocolBody).not.toMatch(/unverifiedReason\s*:/)
    expect(sheetBody).not.toMatch(/unverifiedReason\s*:/)
  })

  it('源码级：两个必填字段清单里都没有它（附反向自检，防抽错位置造成假绿）', () => {
    const src = readFileSync(VALIDATE_QUEUE_SRC, 'utf8')

    const taskFields = literalOf(src, 'const REQUIRED_TASK_FIELDS')
    expect(taskFields, '抽错清单：这不是 REQUIRED_TASK_FIELDS').toContain("'id'")
    expect(taskFields, '抽错清单：这不是 REQUIRED_TASK_FIELDS').toContain("'updatedBy'")
    expect(taskFields).not.toContain('unverifiedReason')

    const topFields = literalOf(src, 'const REQUIRED_TOP_LEVEL_FIELDS')
    expect(topFields, '抽错清单：这不是 REQUIRED_TOP_LEVEL_FIELDS').toContain("'version'")
    expect(topFields, '抽错清单：这不是 REQUIRED_TOP_LEVEL_FIELDS').toContain("'ready'")
    expect(topFields).not.toContain('unverifiedReason')

    // 更强的一条：整个队列校验文件都不提这个字段（它属验收单，不属队列校验面）
    expect(stripComments(src)).not.toContain('unverifiedReason')
  })
})
