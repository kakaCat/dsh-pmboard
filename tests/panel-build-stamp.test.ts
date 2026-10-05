/**
 * 构建戳单测（REQ-261001124111-5d36 t4）。
 *
 * 覆盖三件事：
 *   ① 宿主侧现算戳 == sha256(lib/client.cjs) 前 12 位（口径自洽，不依赖构建）；
 *   ② wrap 脚本确实注入了内联戳（源码级断言——产物新鲜度由 `pnpm build:client` 的
 *      verify-client-build 门禁负责，避免让普通 `npx vitest run` 依赖一次构建）；
 *   ③ 戳判定的三态（相等 / 不等 / 缺失）——宁可漏报，不可误报。
 *
 * serves: FR-5
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { clientBuildStamp, clientCjsPath, STAMP_CHARS } from '../src/http/client-build.js'
import { stampMismatch } from '../src/client/panel-refresh.js'

describe('宿主侧戳口径', () => {
  it('clientBuildStamp() == sha256(lib/client.cjs) 前 12 位', () => {
    const file = clientCjsPath()
    expect(file, 'lib/client.cjs 必须存在（先跑 pnpm build:client 产出）').toBeDefined()
    const expected = createHash('sha256').update(readFileSync(file!)).digest('hex').slice(0, STAMP_CHARS)
    expect(clientBuildStamp()).toBe(expected)
    expect(clientBuildStamp()).toHaveLength(STAMP_CHARS)
  })
  it('定位是「逐级向上找」，打包形态（dist/）与源码形态（src/http/）都命中包根', () => {
    const file = clientCjsPath()
    expect(file).toBeDefined()
    expect(file!.endsWith('/lib/client.cjs')).toBe(true)
  })
})

describe('wrap 脚本注入内联戳', () => {
  it('wrap-client.mjs 写入了 window.__DSH_PM_BUILD__，且哈希对象是 client.cjs 的原始字节', () => {
    const src = readFileSync('scripts/wrap-client.mjs', 'utf8')
    expect(src).toContain('window.__DSH_PM_BUILD__ = ${JSON.stringify(stamp)}')
    expect(src).toContain("createHash('sha256').update(cjsBuf)")
    expect(src).toContain('slice(0, 12)')
  })
  it('构建门禁会核对「内联戳 == client.cjs 现算戳」（否则恒误报/漏报）', () => {
    const verify = readFileSync('scripts/verify-client-build.mjs', 'utf8')
    expect(verify).toContain('__DSH_PM_BUILD__')
    expect(verify).toContain('内联构建戳与 client.cjs 不一致')
  })
})

describe('戳判定：任一端缺失一律不提示', () => {
  it('三态', () => {
    expect(stampMismatch('aaaaaaaaaaaa', 'bbbbbbbbbbbb')).toBe(true)
    expect(stampMismatch('aaaaaaaaaaaa', 'aaaaaaaaaaaa')).toBe(false)
    expect(stampMismatch(undefined, 'bbbbbbbbbbbb')).toBe(false)
    expect(stampMismatch('aaaaaaaaaaaa', undefined)).toBe(false)
    expect(stampMismatch('', '')).toBe(false)
  })
})
