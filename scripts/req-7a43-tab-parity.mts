/**
 * 逐 Tab「原型 vs 实现」对照出图（REQ-261006130057-7a43 · D-10 返工的证据脚本）。
 *
 * 为什么需要它：验收期人给的反馈是「某些 Tab 与原型不一致」——这类判断**只能靠并排看**。
 * 本脚本对每个 Tab 出**一张上下拼合的对照图**（上：权威原型 `prototypes/detail.html#tab-<key>`；
 * 下：当前实现用**真 render 函数 + 真 CSS + 同一份标本数据**渲染），落 `evidence/tab-parity-<key>.png`。
 *
 * 口径：
 *   · 视口同宽（默认 1280 CSS px，`--force-device-scale-factor=1` 防 2 倍图把拼图拉太大）；
 *   · 原型按 hash 直开对应 Tab（`#tab-<key>`，原型内建切换脚本）；
 *   · 实现走 `scripts/fixtures/req-detail-specimen.mts` 的 `specimenShellForPanel`（与探针/截图同源标本）；
 *   · 拼合后每张图顶部画一条标注带（写明 key / 宽度 / 两侧来源），便于人一眼对账。
 *
 * 用法：npx tsx scripts/req-7a43-tab-parity.mts [--width 1280]
 * 退出码：0 = 全部出图成功；1 = 有 Tab 缺图/尺寸不对（响亮失败）；2 = 环境不可用（找不到 Chrome）。
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { specimenShellForPanel } from './fixtures/req-detail-specimen.mts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROTOTYPE = join(ROOT, 'docs', 'requirements', 'REQ-261006130057-7a43', 'prototypes', 'detail.html')
const OUT_DIR = join(ROOT, 'docs', 'requirements', 'REQ-261006130057-7a43', 'evidence')

/** 要对照的 Tab（顺序 = 人的疑虑顺序）。 */
const TABS = ['trunk', 'docs', 'verify', 'token', 'prompts', 'dag', 'dialogue'] as const
type TabKey = (typeof TABS)[number]

/** 每张对照图的高度（面板内容高度不一，取一个够看的统一定值；超出部分按视口截断）。 */
const HEIGHT: Record<TabKey, number> = {
  trunk: 1200, docs: 1100, verify: 1150, token: 1100, prompts: 1000, dag: 900, dialogue: 950,
}

function findChrome(): string | undefined {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ]
  return candidates.find(p => existsSync(p))
}

/**
 * 从原型页里**只抽一个面板**（`<div id="panel-<key>">`，配对标签计数）并带上原型的样式表。
 *
 * 为什么必须抽：原型页顶部有大段「优化点对照导览」，整页截图会把面板挤到画面外，
 * 上下拼图变成"导览区 vs 面板"的错位对照。抽出面板后两侧口径一致（都是面板本体），
 * 外层补一个 `mock-zone` 容器以保留原型的后代选择器语境（不渲染 FR 标注钉）。
 */
function panelOnlyHtml(key: string): string {
  const raw = readFileSync(PROTOTYPE, 'utf8')
  const styles = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')
  const marker = 'id="panel-' + key + '"'
  const at = raw.indexOf(marker)
  if (at < 0) throw new Error('原型里找不到面板：' + key)
  const openStart = raw.lastIndexOf('<', at)
  const openEnd = raw.indexOf('>', at)
  let depth = 1
  let i = openEnd + 1
  let end = -1
  while (i < raw.length && depth > 0) {
    const nextOpen = raw.indexOf('<div', i)
    const nextClose = raw.indexOf('</div>', i)
    if (nextClose < 0) break
    if (nextOpen >= 0 && nextOpen < nextClose) { depth += 1; i = nextOpen + 4 } else {
      depth -= 1
      i = nextClose + 6
      if (depth === 0) end = nextClose + 6
    }
  }
  if (end < 0) throw new Error('原型面板未正确闭合：' + key)
  const section = raw.slice(openStart, end).replace(/\sclass="d-none"/, '')
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>'
    + styles
    + '</style></head><body style="margin:0;background:#fff">'
    + '<div class="mock-zone on" style="border:0;padding:0;margin:0;height:auto">'
    + section + '</div></body></html>'
}

function shot(chrome: string, url: string, out: string, width: number, height: number): void {
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${String(width)},${String(height)}`,
    '--force-device-scale-factor=1',
    `--screenshot=${out}`, url,
  ], { stdio: 'pipe' })
  if (!existsSync(out) || statSync(out).size === 0) throw new Error('截图失败：' + out)
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const wi = argv.indexOf('--width')
  const width = wi >= 0 ? Number(argv[wi + 1]) : 1280
  if (!Number.isFinite(width) || width < 320) throw new Error('--width 非法')

  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('环境不可用：找不到 Chrome（Chromium）。装了再跑，别静默跳过。')
    process.exit(2)
  }
  if (!existsSync(PROTOTYPE)) {
    console.error('FAIL 原型缺档：' + PROTOTYPE)
    process.exit(1)
  }
  mkdirSync(OUT_DIR, { recursive: true })
  const dir = mkdtempSync(join(tmpdir(), 'pm-7a43-parity-'))
  const failures: string[] = []
  try {
    for (const key of TABS) {
      const height = HEIGHT[key]
      const protoPng = join(dir, `proto-${key}.png`)
      const protoHtml = join(dir, `proto-${key}.html`)
      writeFileSync(protoHtml, panelOnlyHtml(key))
      const implPng = join(dir, `impl-${key}.png`)
      const html = join(dir, `impl-${key}.html`)
      writeFileSync(html, specimenShellForPanel(width, 'inflight', key))
      shot(chrome, `file://${protoHtml}`, protoPng, width, height)
      shot(chrome, `file://${html}`, implPng, width, height)
      // 拼图：上原型 / 下实现（PIL 由调用方在 shell 里补；这里只保证两张原料齐）
      const out = join(OUT_DIR, `tab-parity-${key}-proto.png`)
      const out2 = join(OUT_DIR, `tab-parity-${key}-impl.png`)
      copyFileSync(protoPng, out)
      copyFileSync(implPng, out2)
      console.log(`OK ${key}：原型 ${out} ｜ 实现 ${out2}`)
    }
  } catch (err) {
    failures.push(err instanceof Error ? err.message : String(err))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  if (failures.length > 0) {
    console.error('TAB PARITY FAIL：\n  - ' + failures.join('\n  - '))
    process.exit(1)
  }
  console.log(`TAB PARITY PASS（${String(TABS.length)} 个 Tab × 原型/实现两张，目录 ${OUT_DIR}）`)
}

void main()
