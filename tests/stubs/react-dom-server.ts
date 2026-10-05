/**
 * 测试用 `react-dom/server` 垫片（vitest alias 目标 + tsconfig `paths` 目标）。
 *
 * ## 为什么需要
 *
 * 与 `tests/stubs/react.ts` 同因：本包把 react 声明为 **external**（运行时由 DSH web shell
 * 的 module-loader seed 提供），node_modules 里**没有 react、也没有 react-dom**——
 * `tests/host-panel.test.ts` 的 `import { renderToStaticMarkup } from 'react-dom/server'`
 * 会以「Cannot find module / Failed to load url」整文件失败。
 *
 * ## 局限（**必须知道，不要当成真 react-dom**）
 *
 * 本垫片**不是** react-dom：它只在 `tests/stubs/react.ts` 的元素形状
 * （`{ type, props: { children, ... }, $$typeof }`）上做**递归字符串拼接**，
 * 够 `host-panel.test.ts` 的「容器 class / data 属性」与「usePanelInfo 被订阅」两条契约断言用。
 * 它**不实现**真实 react-dom 的序列化语义：不做属性白名单校验、不做 void 元素自闭合差异、
 * 不做文本节点转义的全套 HTML5 规则、不处理 Suspense/Portal/事件属性。
 * ⇒ 断言的是「宿主产出的元素结构」，不是「真 react-dom 会怎么渲染」。
 *
 * 边界：只保证「调用不抛、结构可断言」，不改变生产行为（生产不 import 本文件）。
 *
 * @module dsh-pmboard/tests/stubs/react-dom-server
 */
import type { StubElement } from './react.ts'

/** 无需闭合标签的元素（HTML void elements）；其余一律 `<tag ...>children</tag>`。 */
const VOID_TAGS: ReadonlySet<string> = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/** HTML 文本/属性转义（够断言用；不是完整 HTML5 规则）。 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** react 元素判据：与垫片 `createElement` 同款印记（区分「合法元素」与「手写裸对象」）。 */
function isStubElement(value: unknown): value is StubElement {
  const o = value as { $$typeof?: unknown; type?: unknown; props?: unknown } | null | undefined
  return typeof o === 'object' && o !== null && o.$$typeof === Symbol.for('react.element')
}

/** 属性名映射（React DOM 属性名 → HTML 属性名）。 */
const ATTR_NAMES: Readonly<Record<string, string>> = { className: 'class', htmlFor: 'for' }

/**
 * 属性序列化：跳过 children / ref / key / 函数 / null / false / 普通对象
 * （真实 react-dom 也不会把这些写成 HTML 属性）。
 */
function attrsOf(props: Record<string, unknown>): string {
  let out = ''
  for (const [rawKey, value] of Object.entries(props)) {
    if (rawKey === 'children' || rawKey === 'ref' || rawKey === 'key') continue
    if (value === null || value === undefined || value === false) continue
    if (typeof value === 'function' || typeof value === 'object' || typeof value === 'symbol') continue
    const name = ATTR_NAMES[rawKey] ?? rawKey
    out += value === true ? ` ${name}=""` : ` ${name}="${esc(String(value))}"`
  }
  return out
}

/**
 * 静态渲染一棵（垫片形状的）元素树为 HTML 字符串。
 *
 * - 函数类型 = 组件：直接调用取返回元素再递归（hooks 由 react 垫片提供无状态桩）；
 * - 字符串类型 = 宿主标签；
 * - 数组 / 字符串 / 数字 = 子节点（`false`/`null`/`undefined` 渲染为空，与 React 一致）。
 */
export function renderToStaticMarkup(element: unknown): string {
  if (element === null || element === undefined || typeof element === 'boolean') return ''
  if (typeof element === 'string') return esc(element)
  if (typeof element === 'number') return esc(String(element))
  if (Array.isArray(element)) return element.map(renderToStaticMarkup).join('')
  if (!isStubElement(element)) return ''

  const { type, props } = element
  const children = props.children ?? []
  if (typeof type === 'function') {
    // 组件：以 props 调用一次（不实现 diff/重渲染语义）
    return renderToStaticMarkup((type as (p: unknown) => unknown)(props))
  }
  if (typeof type !== 'string') return '' // Fragment / 其它符号：本垫片不渲染

  const attrText = attrsOf(props)
  if (VOID_TAGS.has(type)) return `<${type}${attrText}/>`
  return `<${type}${attrText}>${renderToStaticMarkup(children)}</${type}>`
}

const _default = { renderToStaticMarkup }
export default _default
