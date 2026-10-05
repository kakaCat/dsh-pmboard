/**
 * 生产装配的守卫（REQ-261004103330-005f，2026-10-04）。
 *
 * ## 这份文件为什么存在
 *
 * 人实测报来一条：「**系统记录通道未装配（fetchSystemRecord 缺失）**」。
 * 查下来根因是 `settings/singleton.ts` 里只注入了 `fetchRunSettings` **一个**函数，
 * 而弹窗要用**七个**（后续又加了「浏览…」）——于是生产环境里：保存上限报「保存通道未装配」、存储屏的确认门与迁移全报「未装配」、
 * 系统记录屏报「fetchSystemRecord 缺失」。**整块功能在生产里是残的。**
 *
 * 为什么一路测试都绿：单测一律注入**假 api**；控制器把 api 的方法设计成**可选**（缺省时如实报
 * 「通道未装配」而不假装成功），这个"优雅降级"恰恰把「真装配漏了」藏住了。
 * 于是这里断言**真装配**：六个一个不少，且每个都必须是函数。
 *
 * 同类教训在本次需求里出现过两次（端到端抓出的"后端选择重启不生效"、形态断言抓出的"记录屏漏标题"）——
 * 共同点都是：**没人测"接起来的那个东西"**。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { boardSettingsApi } from '../src/client/settings/singleton.ts'
import * as api from '../src/client/api.ts'

/** 弹窗在生产里必须拿到的全部接口（改这里 = 改契约，请连带改 singleton 与控制器类型）。 */
const REQUIRED = [
  'fetchRunSettings',
  'patchRunSettings',
  'requestStorageAction',
  'switchStorageBackend',
  'startLedgerMigration',
  'fetchSystemRecord',
  'pickStoragePath',
] as const

describe('设置弹窗的生产装配', () => {
  const wired = boardSettingsApi() as unknown as Record<string, unknown>

  it('七个接口一个不少', () => {
    for (const name of REQUIRED) {
      expect(wired[name], `装配缺了 ${name}`).toBeDefined()
    }
  })

  it('每个都是真的函数（不是 undefined / 占位）', () => {
    for (const name of REQUIRED) {
      expect(typeof wired[name], name).toBe('function')
    }
  })

  it('注入的就是 api.ts 里那几个（名字改了这里就会红）', () => {
    const mod = api as unknown as Record<string, unknown>
    for (const name of REQUIRED) {
      expect(typeof mod[name], `api.ts 里没有 ${name}`).toBe('function')
      expect(wired[name], name).toBe(mod[name])
    }
  })

  it('不夹带多余键（避免「注入了别的同名东西」这种误解）', () => {
    expect(Object.keys(wired).sort()).toEqual([...REQUIRED].sort())
  })

  /**
   * **源码级静态判据**：`controller()` 必须把 `boardSettingsApi()` 整个交给控制器，
   * 而不是手写一个子集对象。
   *
   * 为什么非得看源码：上面三条只证明"工厂函数是齐的"，证明不了"装配真的用了它"——
   * 反向演练实测过：把装配改回 `api: { fetchRunSettings }`，上面三条**照样全绿**。
   * 本仓已有同类先例（A7 门禁锚定标识符）。这条不解释语义，只钉住"不许手写子集"。
   */
  it('装配处必须整体传 boardSettingsApi()，不许手写子集对象', () => {
    const src = readFileSync(new URL('../src/client/settings/singleton.ts', import.meta.url), 'utf8')
    expect(src).toContain('api: boardSettingsApi(),')
    // 不许再出现 `api: {`（那正是当初漏掉五个函数的写法）
    expect(src).not.toMatch(/api:\s*\{/)
  })
})
