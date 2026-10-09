/**
 * t12（REQ-261007223647-da5d · serves: FR-6 / 设计 interfaces.md IF-7）单测：
 * **根解析诊断** —— 面板显示地址时，能说出这个地址是用哪个根拼出来的。
 *
 * 治什么（2026-10-07 用户现场）：面板显示 `./dsh` 下的地址，实际文件在工作区/文档位置。
 * 台账无罪，是前端三级根回落链在缓存缺失/串会话时拿错根——而它**静默**发生，事后无从追查。
 * 本卡只补"读数"：解析行为逐字不变，多记一个 `rootSource` + 只读诊断 `peekLastRootSource()`。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  absolutizeDocPath,
  absolutizeDocPathWithSource,
  peekLastRootSource,
  setDocWorkspaceContext,
} from '../src/client/open-doc.ts'

const REQ = 'REQ-261007223647-da5d'
const REL = 'docs/requirements/' + REQ + '/requirement.md'

beforeEach(() => {
  // 每个用例从"什么都不知道"的干净态起（模块级缓存是全局的，不清会互相污染）
  setDocWorkspaceContext(undefined, undefined, {}, undefined)
  // 读数也是模块级状态：用一次绝对路径解析把它显式置回 none，用例之间不靠执行顺序
  absolutizeDocPath('/__reset__')
})

describe('t12 · 三场景根来源（IF-7）', () => {
  it('需求级根命中 → req-root（读与写同根，最可信）', () => {
    setDocWorkspaceContext('/server-ws', '/home/u', { [REQ]: '/req-ws' }, '/session-ws')
    expect(absolutizeDocPath(REL)).toBe('/req-ws/' + REL)
    expect(peekLastRootSource()).toBe('req-root')
  })

  it('只有会话根 → session-root（跨需求时可能不是真落点，所以要说出来）', () => {
    setDocWorkspaceContext('/server-ws', '/home/u', {}, '/session-ws')
    expect(absolutizeDocPath(REL)).toBe('/session-ws/' + REL)
    expect(peekLastRootSource()).toBe('session-root')
  })

  it('只有服务端根 → server-root', () => {
    setDocWorkspaceContext('/server-ws', '/home/u', {}, undefined)
    expect(absolutizeDocPath(REL)).toBe('/server-ws/' + REL)
    expect(peekLastRootSource()).toBe('server-root')
  })

  it('三类根全空 → none，且**原样返回相对路径**（不拼一个必然不存在的绝对路径）', () => {
    setDocWorkspaceContext(undefined, undefined, {}, undefined)
    expect(absolutizeDocPath(REL)).toBe(REL)
    expect(peekLastRootSource()).toBe('none')
  })

  it('已是绝对路径 → 原样返回、来源 none（没用任何根）', () => {
    setDocWorkspaceContext('/server-ws', undefined, { [REQ]: '/req-ws' }, '/session-ws')
    expect(absolutizeDocPath('/abs/' + REL)).toBe('/abs/' + REL)
    expect(peekLastRootSource()).toBe('none')
  })
})

describe('t12 · 串会话保护与逐字兼容', () => {
  it('串会话缓存下需求级根命中 → 绝不退到会话根（来源也必须是 req-root）', () => {
    // 现场形态：看板挂在 A 会话，缓存里还留着 B 会话的根；需求级根命中就该赢
    setDocWorkspaceContext('/server-ws', undefined, { [REQ]: '/req-ws' }, '/other-session-ws')
    expect(absolutizeDocPath(REL)).toBe('/req-ws/' + REL)
    expect(peekLastRootSource()).toBe('req-root')
  })

  it('需求级根只对该需求生效：别的需求走会话根', () => {
    setDocWorkspaceContext(undefined, undefined, { [REQ]: '/req-ws' }, '/session-ws')
    expect(absolutizeDocPath('docs/requirements/REQ-other/requirement.md'))
      .toBe('/session-ws/docs/requirements/REQ-other/requirement.md')
    expect(peekLastRootSource()).toBe('session-root')
  })

  it('返回行为逐字兼容：与改造前同一套输入 → 同一套输出', () => {
    // 逐字对照（改造前的实现只返回字符串；此处按同规则手算期望值）
    setDocWorkspaceContext('/ws', undefined, {}, '/sess')
    expect(absolutizeDocPath('docs/x.md')).toBe('/sess/docs/x.md')
    expect(absolutizeDocPath('./docs/x.md')).toBe('/sess/docs/x.md')
    expect(absolutizeDocPath('docs\\x.md')).toBe('/sess/docs/x.md')
    expect(absolutizeDocPath('/already/abs.md')).toBe('/already/abs.md')
    // 尾斜杠归一：根末尾多一个斜杠不该拼出双斜杠
    setDocWorkspaceContext('/ws/', '/home/u', { [REQ]: '/req-ws/' }, undefined)
    expect(absolutizeDocPath(REL)).toBe('/req-ws/' + REL)
  })

  it('absolutizeDocPathWithSource 是纯读：不污染 peek 读数', () => {
    setDocWorkspaceContext(undefined, undefined, { [REQ]: '/req-ws' }, '/session-ws')
    expect(peekLastRootSource()).toBe('none')
    expect(absolutizeDocPathWithSource('docs/requirements/REQ-other/x.md')).toEqual({
      abs: '/session-ws/docs/requirements/REQ-other/x.md',
      source: 'session-root',
    })
    // 纯函数式调用（UI 取"地址 + 可信度"两件事同源）不该改写"上一次 absolutize 用了哪个根"
    expect(peekLastRootSource()).toBe('none')
  })
})
