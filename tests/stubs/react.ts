/**
 * 测试用 react 垫片（vitest alias 目标）。
 *
 * 为什么需要：本包把 react 声明为 external（运行时由 DSH web shell 的 module-loader
 * seed 提供），因此 node_modules 里**没有 react**——任何 import 到 `page/host.ts`
 * 的用例都会以「Failed to load url react」整文件失败（`tests/client-page-register.test.ts`
 * 长期红即此因）。本垫片按 `src/client/react-shim.d.ts` 的最小契约实现，
 * 让纯逻辑/DOM 字符串断言类用例能跑，不改变生产行为。
 *
 * 边界：不实现 diff/渲染语义，只保证「调用不抛、结构可断言」。
 */

export interface StubElement {
  type: unknown
  props: Record<string, unknown> & { children: unknown[] }
  /** 真实 React 的元素印记；垫片必须带上，见 createElement 注释。 */
  $$typeof: symbol
}

/**
 * 与 react 同形的极简元素对象（够断言 type/props 用）。
 *
 * `$$typeof` 不是装饰（2026-10-04）：此前垫片返回的裸 `{ type, props }` 与
 * 「手写裸对象当元素用」的**错误写法**形状完全一致，于是 `KnowledgePanelIcon`
 * 那种写法在单测里看不出来，上线即被 React 判
 * `Objects are not valid as a React child` 并被插槽退役（图标静默消失）。
 * 补上 `$$typeof` 后，垫片与真实 React 的「合法元素」判据对齐：
 * 断言 `$$typeof` 的用例能区分 createElement 产物与裸对象。
 */
export function createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): StubElement {
  const rest = { ...(props ?? {}) }
  delete rest.children
  return { type, props: { ...rest, children }, $$typeof: Symbol.for('react.element') }
}

/** 无状态语义的 hook 桩：返回初始值与稳定句柄，足以让组件体跑完。 */
export function useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void] {
  const value = typeof initial === 'function' ? (initial as () => S)() : initial
  return [value, () => { /* 测试不驱动重渲染 */ }]
}

export function useEffect(): void { /* 测试不驱动副作用 */ }

export function useRef<T>(initial: T): { current: T } {
  return { current: initial }
}

export function useCallback<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn
}

const _default = { createElement, useState, useEffect, useRef, useCallback }
export default _default
