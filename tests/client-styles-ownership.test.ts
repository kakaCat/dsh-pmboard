/**
 * client 样式表**归属**契约（2026-10-01 修复「刷新后流程节点样式全丢」）。
 *
 * ## 被围堵的缺陷
 *
 * DSH 的 client-modules 在每次模块 materialize 时执行 `claimStyles(ownerId)`：
 * 把文档里所有 `style:not([data-plugin])` **认领给当前 materialize 的那个插件**；
 * 卸载 / HMR 替换 / 图行裁剪时按 `data-plugin` 调 `removeOwnedStyles(ownerId)` 整批删除。
 * （DSH 侧实现：`packages/client/modules/src/client/system.ts` 的 claimStyles、
 * `entry-lifecycle.ts` 的 removeOwnedStyles；官方 tsdown 预设
 * `packages/client/tsdown.client.ts` 的 styleInjectionModule 因此自带
 * `tag.dataset.plugin = id`，并在**工厂执行期**注入。）
 *
 * 本插件此前不带归属章、且在 apply() 阶段才注入 → 样式表一直是「无主」的，被下一个
 * materialize 的别的插件认领走；那个插件一被替换/裁剪，我们的样式就被连带删除，
 * 而本插件的 apply() 不会因此重跑 —— 样式再也不回来（用户看到节点竖排、配色/圆点/连线全丢）。
 *
 * 本用例把 shell 的认领/删除算法**逐条复刻**（不引 DSH 依赖，保持本包独立），断言：
 * 认领不走、删除删不掉、纠正归属不重复插表、被删后能自愈。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const CSS_TAG = 'dsh-pmboard/styles.css'
const PLUGIN_ID = 'dsh-pmboard'

/** 最小 <style> 元素替身：属性表 + dataset 投影（dataset.plugin ↔ data-plugin）。 */
class FakeStyleElement {
  readonly tagName = 'STYLE'
  textContent = ''
  parent: FakeHead | null = null
  private readonly attrs = new Map<string, string>()

  constructor(attrs: ReadonlyArray<readonly [string, string]> = []) {
    for (const [k, v] of attrs) this.attrs.set(k, v)
  }

  get dataset(): { plugin?: string; pluginCss?: string } {
    const self = this
    return {
      get plugin(): string | undefined { return self.attrs.get('data-plugin') },
      set plugin(value: string | undefined) { if (value === undefined) self.attrs.delete('data-plugin'); else self.attrs.set('data-plugin', value) },
      get pluginCss(): string | undefined { return self.attrs.get('data-plugin-css') },
      set pluginCss(value: string | undefined) { if (value === undefined) self.attrs.delete('data-plugin-css'); else self.attrs.set('data-plugin-css', value) },
    }
  }

  getAttribute(name: string): string | null { return this.attrs.get(name) ?? null }
  setAttribute(name: string, value: string): void { this.attrs.set(name, value) }
  remove(): void { this.parent?.removeChild(this) }
}

/** 最小 head 替身（appendChild / removeChild 维护父子关系）。 */
class FakeHead {
  readonly children: FakeStyleElement[] = []
  appendChild(el: FakeStyleElement): FakeStyleElement { this.children.push(el); el.parent = this; return el }
  removeChild(el: FakeStyleElement): void {
    const i = this.children.indexOf(el)
    if (i >= 0) this.children.splice(i, 1)
    el.parent = null
  }
}

/**
 * 只实现生产代码真正用到的那几种选择器；出现没实现的选择器就**响亮失败**
 * （生产代码换了选择器而用例悄悄不匹配，是这种契约测试最危险的失效方式）。
 */
function matches(el: FakeStyleElement, selector: string): boolean {
  if (selector === 'style') return true
  const attr = /^style\[([a-z-]+)="([^"]*)"\]$/.exec(selector)
  if (attr !== null) return el.getAttribute(attr[1]) === attr[2]
  const not = /^style:not\(\[([a-z-]+)\]\)$/.exec(selector)
  if (not !== null) return el.getAttribute(not[1]) === null
  throw new Error(`FakeDom: unsupported selector ${JSON.stringify(selector)}`)
}

interface FakeDom {
  head: FakeHead
  document: { head: FakeHead; createElement: (tag: string) => FakeStyleElement; querySelector: (s: string) => FakeStyleElement | null; querySelectorAll: (s: string) => FakeStyleElement[] }
  /** 当前文档里的全部样式表。 */
  sheets: () => FakeStyleElement[]
  /** 预置一张样式表（模拟旧版本 bundle 已注入、或别的插件注入的表）。 */
  seed: (attrs?: ReadonlyArray<readonly [string, string]>) => FakeStyleElement
}

function makeFakeDom(): FakeDom {
  const head = new FakeHead()
  const document = {
    head,
    createElement(tag: string): FakeStyleElement {
      if (tag !== 'style') throw new Error(`FakeDom: unsupported element ${tag}`)
      return new FakeStyleElement()
    },
    querySelector(selector: string): FakeStyleElement | null {
      return head.children.find((el) => matches(el, selector)) ?? null
    },
    querySelectorAll(selector: string): FakeStyleElement[] {
      return head.children.filter((el) => matches(el, selector))
    },
  }
  return {
    head,
    document,
    sheets: () => [...head.children],
    seed: (attrs = []) => {
      const el = new FakeStyleElement(attrs)
      head.appendChild(el)
      return el
    },
  }
}

/** shell 算法复刻：materialize 时把无主样式表认领给当前插件。 */
function claimStyles(dom: FakeDom, ownerId: string): void {
  for (const el of dom.document.querySelectorAll('style:not([data-plugin])')) el.setAttribute('data-plugin', ownerId)
}

/** shell 算法复刻：插件被替换 / 裁剪时按归属整批删除。 */
function removeOwnedStyles(dom: FakeDom, ownerId: string): void {
  for (const el of dom.document.querySelectorAll(`style[data-plugin="${ownerId}"]`)) el.remove()
}

describe('client 样式表归属（刷新后样式全丢的围堵）', () => {
  let dom: FakeDom

  beforeEach(() => {
    dom = makeFakeDom()
    vi.stubGlobal('document', dom.document)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('模块求值期（= client bundle 工厂执行期）就注入，并自带 data-plugin 归属章', async () => {
    await import('../src/client/styles.js')
    const sheets = dom.sheets()
    expect(sheets).toHaveLength(1)
    expect(sheets[0].getAttribute('data-plugin')).toBe(PLUGIN_ID)
    expect(sheets[0].getAttribute('data-plugin-css')).toBe(CSS_TAG)
    expect((sheets[0].textContent ?? '').length).toBeGreaterThan(1000)
  })

  it('别的插件 materialize 认领不走本表 → 它的 removeOwnedStyles 删不到我们', async () => {
    await import('../src/client/styles.js')
    claimStyles(dom, '@deepseek-ai/dsh-client-ui-other')
    expect(dom.sheets()[0].getAttribute('data-plugin')).toBe(PLUGIN_ID)
    removeOwnedStyles(dom, '@deepseek-ai/dsh-client-ui-other')
    expect(dom.sheets().map((s) => s.getAttribute('data-plugin-css'))).toEqual([CSS_TAG])
  })

  it('本插件被 HMR 替换（shell 先删后重新 materialize）：工厂重跑即补回，不重复插表', async () => {
    const first = await import('../src/client/styles.js')
    removeOwnedStyles(dom, PLUGIN_ID)
    expect(dom.sheets()).toHaveLength(0)
    vi.resetModules()
    await import('../src/client/styles.js') // 新 bundle 的工厂执行
    expect(dom.sheets()).toHaveLength(1)
    // 同一次求值内的重复调用（apply 也会调）幂等
    first.injectStyles()
    expect(dom.sheets()).toHaveLength(1)
  })

  it('存量无主表（旧 bundle 注入 / 被误认领）：纠正归属，而不是再插第二张', async () => {
    const legacy = dom.seed([['data-plugin-css', CSS_TAG]])
    const mod = await import('../src/client/styles.js')
    expect(dom.sheets()).toHaveLength(1)
    expect(legacy.getAttribute('data-plugin')).toBe(PLUGIN_ID)
    mod.injectStyles()
    expect(dom.sheets()).toHaveLength(1)
  })

  it('样式表被移除后仍能自愈（组件在屏时 injectStyles 补回）', async () => {
    const mod = await import('../src/client/styles.js')
    dom.sheets()[0].remove()
    expect(dom.sheets()).toHaveLength(0)
    mod.injectStyles()
    expect(dom.sheets().map((s) => s.getAttribute('data-plugin-css'))).toEqual([CSS_TAG])
    expect(dom.sheets()[0].getAttribute('data-plugin')).toBe(PLUGIN_ID)
  })

  it('无 document（host 侧 / node 环境）时静默不抛', async () => {
    vi.stubGlobal('document', undefined)
    const mod = await import('../src/client/styles.js')
    expect(() => mod.injectStyles()).not.toThrow()
  })
})
