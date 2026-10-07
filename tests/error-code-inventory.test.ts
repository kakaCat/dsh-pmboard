/**
 * 错误码口径的漂移守卫（REQ-261006201814-ac4f FR-1）。
 *
 * ## 这个用例在防什么
 *
 * 本仓是多窗口并发开发的：**错误码会自己长出来**。本需求实施期间就实测到一次——
 * 别的窗口新增了 `REQBOARD_OWNER_WINDOW_NOT_LIVE` 与 `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`
 * 两个码，而没有任何清单知道它们存在。没有守卫时，这种漂移只有等人想起来才发现。
 *
 * ## 三条守卫（红时必须给自助路径，FR-9③）
 *
 *   ① **新增码未进清单** → 红并点名，给出刷新命令；
 *   ② **清单里的产生点失效**（文件没了 / 行原文找不到了）→ 红并点名；
 *   ③ **排除清单被删条目** → 红（防止有人靠删排除项把口径做大）。
 *   另加两条：`unclassified` 必须归零（刷新把红变「可解」，不把红变「绿」）；
 *           小写码 → 大写传输码的映射必须落在清单内（门禁本体不能被漏掉）。
 *
 * ## 假阴性自检（本需求最该记的一课）
 *
 * 「字面量 grep 零覆盖」会**高估缺口**：实测有 7 个码测试其实已经断言了，只是引用定义处常量
 * （`JOURNAL_ERROR.*` / `PATHS_ERROR.*` / `REQUIREMENT_STORE_ERROR.*`）。故本用例按**双形态**
 * 统计覆盖率并把假阴性率打出来——只报字面量口径的读数视为不合格。
 *
 * @module dsh-pmboard/tests/error-code-inventory
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  NOISE_TOKENS, REPO_ROOT, collectConstAliases, collectTestCoverage, scanErrorCodes,
} from './helpers/error-code-scan.js'

const INVENTORY_PATH = join(REPO_ROOT, 'tests/fixtures/error-code-inventory.json')

/** 自助修复命令（守卫报红必须给——报红不给路等于把人卡死）。 */
const REFRESH_CMD = 'npx tsx tests/drill/refresh-error-code-inventory.mts'

interface InventoryUpper {
  code: string
  form: string
  site: { file: string; anchor: string }
  tier: string
  covered: boolean
  coveredHow: 'literal' | 'const' | null
}
interface InventoryLower {
  code: string
  transport: string | null
  site: { file: string; anchor: string }
}
interface Inventory {
  uppercase: InventoryUpper[]
  lowercase: InventoryLower[]
  excluded: { token: string; why: string }[]
}

function loadInventory(): Inventory {
  expect(existsSync(INVENTORY_PATH), '口径清单不在场：' + INVENTORY_PATH + ' —— 先跑 ' + REFRESH_CMD).toBe(true)
  return JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as Inventory
}

describe('① 口径守卫：src 里的码必须全部在清单里（新增码漏配即红）', () => {
  it('扫描结果 ⊆ 清单；差额逐条点名并给自助命令', () => {
    const inv = loadInventory()
    const known = new Set(inv.uppercase.map(u => u.code))
    const scanned = scanErrorCodes()
    const missing = scanned.uppercase.map(u => u.code).filter(c => !known.has(c)).sort()

    expect(
      missing,
      'src 里出现口径内的新码，但清单不知道它们存在：\n  ' + missing.join('\n  ')
      + '\n补齐：跑 ' + REFRESH_CMD + '（新码会以 tier=unclassified 追加，随后请分级）',
    ).toEqual([])
  })

  it('扫描器自检：正常根能扫到码；根不存在时必须响亮失败（不得把「扫不到」当成「没有码」）', () => {
    const scanned = scanErrorCodes()
    expect(scanned.uppercase.length, '扫到 0 个码 ⇒ 扫描器或 src 布局坏了（不是「没有码」）').toBeGreaterThan(0)
    expect(scanned.lowercase.length, '扫到 0 个小写码 ⇒ 两张登记表没解析到').toBeGreaterThan(0)

    let code: string | undefined
    try {
      scanErrorCodes(join(REPO_ROOT, 'src-__not_exist__'))
    } catch (err) {
      code = (err as { code?: string }).code
    }
    expect(code, '扫描根不存在时必须抛 TEST_SCAN_ROOT_MISSING').toBe('TEST_SCAN_ROOT_MISSING')
  })

  it('清单不得出现 unclassified：刷新把红变「可解」，不把红变「绿」', () => {
    const inv = loadInventory()
    const pending = inv.uppercase.filter(u => u.tier === 'unclassified').map(u => u.code).sort()
    expect(
      pending,
      '以下码刚进口径清单但尚未分级：\n  ' + pending.join('\n  ')
      + '\n补齐：给每个码定 tier（direct / fixture / fault）后重跑 ' + REFRESH_CMD,
    ).toEqual([])
  })
})

describe('② 产生点守卫：清单里的 site 必须仍在磁盘上（抗行号漂移，用行原文匹配）', () => {
  it('每个大写码的 site.file 存在、anchor 逐字出现', () => {
    const inv = loadInventory()
    const broken: string[] = []
    for (const u of inv.uppercase) {
      const abs = join(REPO_ROOT, u.site.file)
      if (!existsSync(abs)) {
        broken.push(u.code + ' → 文件不存在：' + u.site.file)
        continue
      }
      if (!readFileSync(abs, 'utf8').includes(u.site.anchor)) {
        broken.push(u.code + ' → 行原文已不在 ' + u.site.file + '：' + u.site.anchor)
      }
    }
    expect(
      broken,
      '清单里的产生点失效（可能是码被删、也可能是那行被改写）：\n  ' + broken.join('\n  ')
      + '\n补齐：若是行移动/改写，跑 ' + REFRESH_CMD + '；若是码真被删，请人工确认后再清清单',
    ).toEqual([])
  })

  it('每个小写码的 site.file 存在、anchor 逐字出现', () => {
    const inv = loadInventory()
    const broken: string[] = []
    for (const l of inv.lowercase) {
      const abs = join(REPO_ROOT, l.site.file)
      if (!existsSync(abs)) {
        broken.push(l.code + ' → 文件不存在：' + l.site.file)
        continue
      }
      if (!readFileSync(abs, 'utf8').includes(l.site.anchor)) {
        broken.push(l.code + ' → 行原文已不在 ' + l.site.file + '：' + l.site.anchor)
      }
    }
    expect(
      broken,
      '小写码产生点失效：\n  ' + broken.join('\n  ') + '\n补齐：跑 ' + REFRESH_CMD,
    ).toEqual([])
  })
})

describe('③ 排除清单守卫：噪声字样不得被删（防靠删排除项把口径做大）', () => {
  it('5 个噪声字样逐条在场', () => {
    const inv = loadInventory()
    const tokens = new Set(inv.excluded.map(e => e.token))
    const missing = NOISE_TOKENS.map(n => n.token).filter(t => !tokens.has(t))
    expect(
      missing,
      '排除清单少了这些字样：' + missing.join('、')
      + '\n它们是标识符/数值常量/目录名/env 后缀，不是错误码——删掉它们会让口径虚高',
    ).toEqual([])
  })

  it('排除项的 why 非空（每条都要说清「它是什么」）', () => {
    const inv = loadInventory()
    const empty = inv.excluded.filter(e => e.why.trim().length === 0).map(e => e.token)
    expect(empty, '以下排除项没写理由：' + empty.join('、')).toEqual([])
  })

  it('噪声字样不得同时出现在大写码清单里（一个字样不能既是码又不是码）', () => {
    const inv = loadInventory()
    const both = NOISE_TOKENS.map(n => n.token).filter(t => inv.uppercase.some(u => u.code === t))
    expect(both, '以下字样同时被当成码与噪声：' + both.join('、')).toEqual([])
  })
})

describe('④ 小写码 → 传输码映射守卫（只测大写会漏掉门禁本体）', () => {
  it('每个小写码的 transport 要么为 null，要么命中大写清单', () => {
    const inv = loadInventory()
    const upper = new Set(inv.uppercase.map(u => u.code))
    const bad = inv.lowercase
      .filter(l => l.transport !== null && !upper.has(l.transport))
      .map(l => l.code + ' → ' + String(l.transport))
    expect(
      bad,
      '以下小写码声明的传输码不在大写清单里（映射表指向了不存在的码）：\n  ' + bad.join('\n  '),
    ).toEqual([])
  })

  it('扫描到的小写码与清单逐字一致（映射表被改动/漏对即红）', () => {
    const inv = loadInventory()
    const now = scanErrorCodes().lowercase.map(l => l.code + '=>' + String(l.transport)).sort()
    const was = inv.lowercase.map(l => l.code + '=>' + String(l.transport)).sort()
    const added = now.filter(x => !was.includes(x))
    const gone = was.filter(x => !now.includes(x))
    expect(
      { added, gone },
      '小写码映射与清单不一致'
      + (added.length > 0 ? '\n  新增：' + added.join('、') : '')
      + (gone.length > 0 ? '\n  消失：' + gone.join('、') : '')
      + '\n补齐：跑 ' + REFRESH_CMD + '（若确属实现改动，请人在报告里说明）',
    ).toEqual({ added: [], gone: [] })
  })
})

describe('⑤ 假阴性自检：覆盖率必须按双形态统计（FR-1④）', () => {
  it('打印双形态读数与假阴性率，并断言常量形态被真正采到', () => {
    const inv = loadInventory()
    const coverage = collectTestCoverage()
    const aliases = collectConstAliases()

    const literal: string[] = []
    const viaConst: string[] = []
    const zero: string[] = []
    for (const u of inv.uppercase) {
      const how = coverage.get(u.code) ?? null
      if (how === 'literal') literal.push(u.code)
      else if (how === 'const') viaConst.push(u.code)
      else zero.push(u.code)
    }

    const covered = literal.length + viaConst.length
    const fnRate = covered === 0 ? 0 : (viaConst.length / covered) * 100
    // 读数进测试输出（t4 的验收与 t13 的改前/改后读数都取这里）
    console.log('[读数] 大写码 ' + inv.uppercase.length
      + ' · 字面量覆盖 ' + literal.length
      + ' · 常量覆盖 ' + viaConst.length
      + ' · 零覆盖 ' + zero.length
      + ' · 假阴性率 ' + fnRate.toFixed(2) + '%'
      + '（常量形态是真覆盖，字面量口径看不见它们）')
    if (zero.length > 0) console.log('[读数] 零覆盖清单：' + zero.join('、'))

    // 常量形态必须真的被采到：采不到就说明「双形态口径」没落地，读数会虚高缺口
    expect(
      viaConst.length,
      '常量形态覆盖数为 0：说明别名表没被采到（alias 条目 ' + aliases.size + '）——'
      + '那时「零覆盖」会虚高，本用例的读数不可信',
    ).toBeGreaterThan(0)

    // 清单里 recorded 的 covered/coveredHow 必须与现场实测一致（清单不得比事实乐观）
    const drift = inv.uppercase
      .filter(u => u.covered !== (coverage.get(u.code) !== undefined))
      .map(u => u.code + '（清单 covered=' + String(u.covered) + '，实测=' + String(coverage.get(u.code) ?? 'none') + '）')
    expect(
      drift,
      '清单记录的覆盖态与现场实测不一致：\n  ' + drift.join('\n  ')
      + '\n补齐：跑 ' + REFRESH_CMD + '（覆盖态由测试实况重算）',
    ).toEqual([])
  })
})
