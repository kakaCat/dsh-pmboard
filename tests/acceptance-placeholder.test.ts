/**
 * 计划期占位符判据（REQ-261006201920-2adc FR-1 · TC-1 / TC-2 · D-2）serves: FR-1
 *
 * 缺陷形态：`npx vitest run <相关测试文件>` 这类**命令的操作数还是占位符**的验收标准，
 * 因为含命令字样（`npx`/`vitest`）被 `VERIFIABLE_ANCHOR` 判绿——「可执行」被形式化成「含命令字样」。
 *
 * 本文件同时是**反向演练 RV-1 的载体**：把 `checkAcceptance` 里的占位符分支注释掉，
 * 本文件必然变红（占位符标准会重新判 ok:true）；还原即绿。两次输出进验收材料。
 */
import { describe, expect, it } from 'vitest'
import { checkAcceptance, PLACEHOLDER_OPERAND } from '../src/domain/task/Acceptability.js'

describe('计划期占位符判据（FR-1 · TC-1）', () => {
  it('命令的操作数还是占位符 → 拒，且文案点名占位符并给出修法', () => {
    const r = checkAcceptance('T-1', '`npx vitest run <相关测试文件>` → 全绿')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toContain('<相关测试文件>')
      expect(r.reason).toContain('真实路径')
      expect(r.reason).toContain('T-1')
    }
  })

  it('四类真占位符全覆盖（模板里实际出现的那几个）', () => {
    const bad = [
      'npx vitest run <本卡改动涉及的测试文件> 全绿',
      'npx vitest run <本卡接口/契约对应的测试文件> → 全绿',
      '给出取数命令（如 `npx tsx scripts/<脚本>.mts`）或输出文件路径',
      'npx vitest run <回归用例> → 转绿',
      'npx vitest run <校验用例> → 全绿',
      'npx vitest run <e2e用例> → 全绿',
      'npx vitest run <探针用例> 的输出',
      'npx tsx scripts/<执行脚本>.mts 的记录条数可复核',
    ]
    for (const t of bad) expect(checkAcceptance('T-bad', t).ok, t).toBe(false)
  })
})

describe('四类合法反例必须放行（FR-1 · TC-2）', () => {
  it('裸正则的误伤面逐类放行', () => {
    const legit = [
      // ① TypeScript 泛型实参
      '按 Record<StageKind,string> 的键集合逐项核对，缺一即报错',
      '索引 Map<realKey, Promise<void>> 的类型断言与实现一致',
      // ② 产品自身的字面量
      'grep -c aria-hidden src/client/icons.ts = 9 且每个值恰 1 个 <svg>',
      'node-panel.ts 只在 hydrateRelTimes 内注入 data-dsh-pm-rel="<ts>"',
      // ③ 路径形态模板（带真实后缀）
      '原型对照：prototypes/verify-disposition.html#FR-3 区块在场，形态 prototypes/<name>.html#FR-N',
      'rtm-implementing/<id>.yml 的 serves 与卡上 refs 一致',
      // ④ 断言某串不出现（命令的操作数已是真实文件，尖括号只出现在断言里）
      "npx vitest run tests/migration-gate.test.ts 全绿，并断言 failure.hint 不含子串 '<单册>' 与 '<数据根>'",
    ]
    for (const t of legit) expect(checkAcceptance('T-legit', t).ok, t).toBe(true)
  })

  it('裸 /<[^>]{2,40}>/ 确实会误伤上面每一类（证明收窄是必要的，不是拍脑袋）', () => {
    const bare = /<[^>]{2,40}>/
    for (const t of [
      '按 Record<StageKind,string> 的键集合逐项核对',
      '每个值恰 1 个 <svg>',
      'prototypes/<name>.html#FR-N 区块在场',
      "断言不含子串 '<单册>'",
    ]) expect(bare.test(t), t).toBe(true)
  })
})

describe('判据不与既有两道判据冲突（FR-1）', () => {
  it('真实命令 + 真实路径 → 照旧放行', () => {
    const good = '运行 npx vitest run tests/x.test.ts → 12 passed'
    expect(checkAcceptance('T-9', good).ok).toBe(true)
  })

  it('含占位符但不是命令操作数（纯路径/字面量语境）→ 放行', () => {
    // 真实路径带后缀 ⇒ 锚点判据过；`<REQ>` 在路径语境而非命令操作数 ⇒ 占位符判据不动它
    expect(checkAcceptance('T-10', '对照 `docs/requirements/<REQ>/design/architecture.md` 逐条核对，无偏离即写明依据').ok).toBe(true)
  })

  it('判据不跨行（命令与占位符分行时不算命令操作数）', () => {
    expect(PLACEHOLDER_OPERAND.test('npx vitest run\n<相关测试文件>')).toBe(false)
  })
})
