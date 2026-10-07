/**
 * README 工具面 ↔ 登记面 校验（REQ-261006201508-5cb6 t3 / FR-1、FR-4）。
 *
 * 解决什么问题：工具清单此前手写在四处（README 正文 / 表头 / 目录树注释 / 源码日志），
 * 漂移是**静默**的——漏改不报错、门禁照样绿，新窗口照 README 找工具会扑空。
 * 本用例把「README 的工具面」与唯一手写事实源（`src/tools/registry.ts`）绑成可跑断言：
 * 集合或计数不一致就红，并**逐条点名**（README 缺：… / README 多：… / 表内 N 行）。
 *
 * 口径（逐字见 docs/requirements/REQ-261006201508-5cb6/design/interfaces.md 第 2 / 4 节）：
 *   ① 工具行 = 行首为「| `reqboard_xxx`」的行（一行一个工具，首列即工具名）；
 *   ② 名字集合 = README 全文里**反引号包裹**的 `reqboard_` 名——`reqboard_*` 这类通配写法
 *      因不满足「反引号 + 下划线后至少一个字符」而不匹配；
 *   ③ 期望值**全部从 TOOL_REGISTRY 派生**，本文件不出现字面量计数（末条用例自检守着这一点）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TOOL_REGISTRY } from '../src/tools/registry.js'

const README_PATH = fileURLToPath(new URL('../README.md', import.meta.url))
const PKG_PATH = fileURLToPath(new URL('../package.json', import.meta.url))
const SELF_PATH = fileURLToPath(import.meta.url)

/** 期望工具名（升序）——派生，不手写。 */
const expectedNames = TOOL_REGISTRY.map((e) => e.toolName).sort()
/** 期望条数——派生，不手写。 */
const expectedCount = TOOL_REGISTRY.length
/** 计数文案：`N 个`（README 与 package.json 里应当出现的那一种写法）。 */
const countText = String(expectedCount) + ' 个'

const readme = readFileSync(README_PATH, 'utf8')
const pkg = readFileSync(PKG_PATH, 'utf8')

/** README 全文里反引号包裹的 reqboard_ 名（去重、升序）。 */
function toolNamesIn(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(/`(reqboard_[a-z_]+)`/g)) found.add(m[1])
  return [...found].sort()
}

/** README 里「| `reqboard_xxx`」形态的工具行（原文行，供计数与点名用）。 */
function toolRowsIn(text: string): string[] {
  return text.split('\n').filter((l) => /^\| `reqboard_/.test(l))
}

/** 表头声明的条数：`## 提供的工具（N 个）`；抽不到返回 undefined（契约形态变了要响亮失败）。 */
function declaredCountIn(text: string): number | undefined {
  const m = /## 提供的工具（(\d+) 个）/.exec(text)
  return m === null ? undefined : Number(m[1])
}

/** 双向差集——失败消息要点名到**具体哪个工具**，否则维护者还得自己 diff 两个集合。 */
function diffOf(actual: readonly string[], expected: readonly string[]): { missing: string[]; extra: string[] } {
  const a = new Set(actual)
  const e = new Set(expected)
  return {
    missing: expected.filter((x) => !a.has(x)),
    extra: actual.filter((x) => !e.has(x)),
  }
}

describe('README 工具面 ↔ 登记面（REQ-261006201508-5cb6）', () => {
  it('工具名集合与登记面完全一致（双向差集为空）', () => {
    const { missing, extra } = diffOf(toolNamesIn(readme), expectedNames)
    expect(missing, 'README 缺：' + (missing.join('、') || '（无）') + '（登记面有、README 没写）').toEqual([])
    expect(extra, 'README 多：' + (extra.join('、') || '（无）') + '（README 写了登记面没有的名字）').toEqual([])
  })

  it('表头声明的条数、表内行数、表内工具名三者都与登记面一致', () => {
    const declared = declaredCountIn(readme)
    const rows = toolRowsIn(readme)
    expect(
      declared,
      '未匹配到节标题「## 提供的工具（N 个）」——格式契约见 design/interfaces.md 第 2 节',
    ).toBeDefined()
    // 行级点名放在计数之前：断言失败会中止本用例，**先报「哪一行没了」比先报「行数差」有用**
    // （README 别处也会提到工具名，如知识层的 reqboard_kb，所以「名字集合」断言可能仍然绿）。
    const rowNames = rows
      .map((l) => /^\| `(reqboard_[a-z_]+)`/.exec(l)?.[1])
      .filter((x): x is string => typeof x === 'string')
    const { missing, extra } = diffOf(rowNames, expectedNames)
    expect(missing, '表内缺行：' + (missing.join('、') || '（无）') + '（登记面有这张卡，表里没有）').toEqual([])
    expect(extra, '表内多行：' + (extra.join('、') || '（无）') + '（表里有，登记面没有）').toEqual([])
    expect(
      declared,
      '登记面 ' + String(expectedCount) + ' 条 / README 写 ' + String(declared) + ' 个',
    ).toBe(expectedCount)
    expect(
      rows.length,
      '表内 ' + String(rows.length) + ' 行 / 登记面 ' + String(expectedCount) + ' 条',
    ).toBe(expectedCount)
  })

  it('README 与 package.json 不再残留旧计数，且出现的计数与登记面一致', () => {
    expect(/13 个|21 个/.test(readme), 'README 仍残留旧计数（13 个 / 21 个）').toBe(false)
    expect(/13 个|21 个/.test(pkg), 'package.json 仍残留旧计数（13 个 / 21 个）').toBe(false)
    const inReadme = readme.split(countText).length - 1
    expect(
      inReadme,
      'README 里「' + countText + '」出现 ' + String(inReadme) + ' 次，应 ≥ 3 次（正文 / 表头 / 目录树注释）',
    ).toBeGreaterThanOrEqual(3)
    const inPkg = pkg.split(countText).length - 1
    expect(
      inPkg,
      'package.json 里「' + countText + '」出现 ' + String(inPkg) + ' 次，应 ≥ 1 次（description）',
    ).toBeGreaterThanOrEqual(1)
  })

  it('每条工具行只写自己的工具名（防止顺带提及别的工具）', () => {
    const offenders = toolRowsIn(readme).filter((l) => (l.match(/reqboard_[a-z_]+/g) ?? []).length > 1)
    expect(
      offenders,
      '以下工具行描述了另一个工具名（契约见 design/interfaces.md 第 2 节）：' + offenders.join(' / '),
    ).toEqual([])
  })

  it('本文件不含字面量计数（期望值必须派生）', () => {
    const self = readFileSync(SELF_PATH, 'utf8')
    // 反向自检：拿**派生出来的数字**去本文件里找——找到就说明写死了。
    expect(
      self.includes(String(expectedCount)),
      '本文件出现字面量 ' + String(expectedCount) + '：期望值必须从登记面派生',
    ).toBe(false)
  })
})
