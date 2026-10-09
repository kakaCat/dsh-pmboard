/**
 * serves: BUG-5（两个新码已注册；注册表 ↔ 扫描双向一致）
 * 错误码注册表的**双向硬门**（REQ-261007230908-5ccb FR-2 · IF-2 · 体检报告 G4）。
 *
 * ## 这个用例在防什么
 *
 * 体检报告 §3.2：136 个大写码散落 123 个文件、无事实源，于是「prompt 列的码 = 代码抛的码」
 * 无法机械检查。t1 建了注册表（src/shared/error-code-registry.ts），本用例把它焊死：
 *
 *   ① **新码未注册即红**——某窗口新抛一个码，守卫当场点名，不再靠人想起来同步；
 *   ② **死条目即红**——注册表登记了但 src 已不抛的码，说明表比事实乐观；
 *   ③ **条目形态**——码形态 / 唯一 / 字典序 / message 非空 / layer 受控；
 *   ④ **占位与噪声不入口径**（D-1）——REQBOARD_XXX、标识符、目录名不冒充错误码；
 *   ⑤ **client 无回流**（IF-5 配套）——toolviews/shared.ts 不得再自持一份大写码映射键。
 *
 * ## 口径纪律（D-2 收敛裁定）
 *
 * 扫描规则**只在 tests/helpers/error-code-scan.ts 实现一次**，本用例只 import 它的
 * `scanErrorCodes` / `NOISE_TOKENS`，不复制任何正则。存量 inventory 五组守卫原样保留：
 * inventory 管「清单 ↔ 扫描」，本用例管「注册表 ↔ 扫描」，两者相邻不重叠。
 *
 * @module dsh-pmboard/tests/error-code-registry
 *
 * serves: FR-2（注册表 ↔ 扫描双向一致硬门；本条需求 REQ-261007230908-5ccb）
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOISE_TOKENS, REPO_ROOT, scanErrorCodes } from './helpers/error-code-scan.js'
import { REQBOARD_CODE_REGISTRY, REQBOARD_CODE_SET, errorCodeMessage } from '../src/shared/error-code-registry.js'

/** 自助修复路径（报红必须给路：注册表补条目 → 重跑本用例）。 */
const FIX_HINT = '在 src/shared/error-code-registry.ts 补/删条目（按 code 字典序插入）后重跑本用例'

describe('① 双向一致：扫描到的码必须已注册，注册的码必须仍在抛', () => {
  it('扫描码 ⊆ 注册表（新码漏注册即红，逐条点名）', () => {
    const scanned = scanErrorCodes().uppercase.map(u => u.code).sort()
    const missing = scanned.filter(c => !REQBOARD_CODE_SET.has(c))
    expect(
      missing,
      'src 里出现了未注册的错误码（注册表是唯一事实源，漏注册等于门禁失效）：\n  ' + missing.join('\n  ')
      + '\n补齐：' + FIX_HINT,
    ).toEqual([])
  })

  it('注册表 ⊆ 扫描码（死条目即红——表不得比事实乐观）', () => {
    const scanned = new Set(scanErrorCodes().uppercase.map(u => u.code))
    const dead = REQBOARD_CODE_REGISTRY.map(e => e.code).filter(c => !scanned.has(c))
    expect(
      dead,
      '注册表登记了 src 已不抛的码（可能是码被删、也可能是那行被改写）：\n  ' + dead.join('\n  ')
      + '\n补齐：确认码确实不再使用后删除条目；若只是移动了产生点，重跑刷新钻即可',
    ).toEqual([])
  })

  it('读数打印：条目数 = 扫描码数（供验收核对，非门禁）', () => {
    const scanned = scanErrorCodes().uppercase.length
    console.log('[读数] 注册表条目 ' + REQBOARD_CODE_REGISTRY.length + ' · 扫描大写码 ' + scanned)
    expect(REQBOARD_CODE_REGISTRY.length).toBe(scanned)
  })
})

describe('② 条目形态：码 / 语义 / 分层三项约束', () => {
  it('码形态合法（REQBOARD_[A-Z0-9_]+），且全表唯一', () => {
    const bad = REQBOARD_CODE_REGISTRY.filter(e => !/^REQBOARD_[A-Z0-9_]+$/.test(e.code)).map(e => e.code)
    expect(bad, '以下条目的码形态非法（应匹配 ^REQBOARD_[A-Z0-9_]+$）：' + bad.join('、')).toEqual([])
    const dupes = REQBOARD_CODE_REGISTRY.map(e => e.code).filter((c, i, arr) => arr.indexOf(c) !== i)
    expect([...new Set(dupes)], '注册表存在重复码：' + dupes.join('、')).toEqual([])
  })

  it('按 code 字典序排列（降低多窗口并发追加的合并冲突面）', () => {
    const codes = REQBOARD_CODE_REGISTRY.map(e => e.code)
    const sorted = [...codes].sort()
    const firstOutOfOrder = codes.findIndex((c, i) => c !== sorted[i])
    expect(
      firstOutOfOrder,
      '注册表未按字典序排列，首个越位位置 index=' + String(firstOutOfOrder)
      + '（' + String(codes[firstOutOfOrder]) + ' 应在 ' + String(sorted[firstOutOfOrder]) + ' 之前/之后）',
    ).toBe(-1)
  })

  it('message 非空且是中文语义（不是把码原样抄一遍）', () => {
    const empty = REQBOARD_CODE_REGISTRY.filter(e => e.message.trim().length === 0).map(e => e.code)
    expect(empty, '以下条目 message 为空：' + empty.join('、')).toEqual([])
    const asciiOnly = REQBOARD_CODE_REGISTRY.filter(e => !/[\u4e00-\u9fff]/.test(e.message)).map(e => e.code)
    expect(asciiOnly, '以下条目 message 无中文（应写「这是什么」而非抄码）：' + asciiOnly.join('、')).toEqual([])
  })

  it('layer 落在受控枚举内', () => {
    const legal = new Set(['application', 'domain', 'tools', 'client', 'http', 'adapters', 'repositories', 'shared'])
    const bad = REQBOARD_CODE_REGISTRY.filter(e => !legal.has(e.layer)).map(e => e.code + '→' + String(e.layer))
    expect(bad, '以下条目 layer 非法（受控枚举 8 值）：' + bad.join('、')).toEqual([])
  })

  it('派生查询与表同源：errorCodeMessage 命中已注册码、miss 返回 undefined', () => {
    expect(errorCodeMessage('REQBOARD_NO_BOUND_REQ')).toBeTruthy()
    expect(errorCodeMessage('REQBOARD_NOT_A_REAL_CODE')).toBeUndefined()
  })
})

describe('③ 占位与噪声不入注册表（D-1 口径）', () => {
  it('NOISE_TOKENS 全部字样不得同时是注册条目（一个字样不能既是码又不是码）', () => {
    const both = NOISE_TOKENS.map(n => n.token).filter(t => REQBOARD_CODE_SET.has(t))
    expect(
      both,
      '以下字样同时出现在噪声清单与注册表里：' + both.join('、')
      + '\n依据：它们是指识符/占位/目录名/数值常量，不是错误码（D-1）',
    ).toEqual([])
  })

  it('占位码 REQBOARD_XXX 不在注册表', () => {
    expect(REQBOARD_CODE_SET.has('REQBOARD_XXX'), 'REQBOARD_XXX 是文案占位符，不得登记为真实码（D-1）').toBe(false)
  })
})

describe('④ client 映射无回流（IF-5 配套）', () => {
  it('toolviews/shared.ts 不再自持大写码字面量键（映射从注册表派生）', () => {
    const path = join(REPO_ROOT, 'src/client/toolviews/shared.ts')
    const text = readFileSync(path, 'utf8')
    const ownUpperKeys = [...text.matchAll(/(?<![A-Za-z0-9_])(REQBOARD_[A-Z0-9_]+)\s*:/g)]
      .map(m => m[1])
      .filter((c): c is string => c !== undefined)
    expect(
      ownUpperKeys,
      'toolviews/shared.ts 又出现自持的大写码键（映射表回流 = 双源复发）：\n  ' + ownUpperKeys.join('\n  ')
      + '\n补齐：大写码映射必须从 src/shared/error-code-registry.ts 派生（IF-5）',
    ).toEqual([])
  })
})
