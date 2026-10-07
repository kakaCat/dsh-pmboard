/**
 * 需求详情页 before/after **对照出图**（REQ-261006130057-7a43 · t9 · T-18）。
 *
 * 为什么需要它：本需求（7 个 Tab：trunk / docs / dag / dialogue / **verify** / token / prompts、
 * 对话聊天气泡 + 吸顶分页、验收 RTM 列表）评审的是版面长相，只能靠图对照。
 * 本脚本出 **after**（= 当前实现的真实渲染：真实 `buildReportShell` + 真实 CSS + 共享标本），
 * 并逐张给出 **before** 的落点——before **不重拍**：复用上一轮 REQ-261005155003-f32f
 * 已确认的 after 图（`docs/requirements/REQ-261005155003-f32f/evidence/ui-after-*.png`，
 * 那一轮的"改后"就是这一轮的"改前"），脚本只核对它们在场并打印对照关系。
 *
 * 用法：npx tsx scripts/req-7a43-ui-shot.mts
 *
 * 产物（5 张 PNG，2 倍图；产出目录不存在时自动创建，重复运行幂等覆盖）：
 *   docs/requirements/REQ-261006130057-7a43/evidence/ui-after-1280-inflight.png          （1280 × 在途 · 汇报 Tab）
 *   docs/requirements/REQ-261006130057-7a43/evidence/ui-after-900-inflight.png           （900 × 在途 · 汇报 Tab）
 *   docs/requirements/REQ-261006130057-7a43/evidence/ui-after-1280-terminal.png          （1280 × 终态 · 汇报 Tab）
 *   docs/requirements/REQ-261006130057-7a43/evidence/ui-after-1280-inflight-verify.png   （1280 × 在途 · #tab-verify RTM 列表）
 *   docs/requirements/REQ-261006130057-7a43/evidence/ui-after-1280-inflight-dialogue.png （1280 × 在途 · #tab-dialogue 聊天气泡）
 *
 * 退出码：0 = 五张图都出好且 before 引用齐；1 = 有图没出成 / 尺寸或体量不对 / before 缺档
 *         （响亮失败）；2 = 环境不可用（找不到 Chrome）。
 *
 * 视口口径与 `scripts/req-detail-ui-shot.mts` 相同：`--window-size=<w>,800` +
 * `--force-device-scale-factor=2`（PNG 像素 = CSS 像素 × 2），实测视口高 800 ≥ 探针首屏 713。
 * **不注入任何仅截图用 CSS**；标本与探针共用 `./fixtures/req-detail-specimen.mts` 同一份
 * （含 verify 面板 mock——8 分组行 5 通过 / 2 待裁决含 1 需人工 / 1 不通过带意见，
 * 与原型 v1.5 #tab-verify 同口径；对话 mock 10 条含 1 条 >120 字符长日志）。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  STATES, WINDOW_HEIGHT, findChrome, specimenShell, specimenShellForPanel,
  type PanelSpecimenKey, type SpecimenState,
} from './fixtures/req-detail-specimen.mts'

/** 仓库根（本脚本在 `<root>/scripts/` 下），产物路径相对它解析——不依赖调用时的 cwd。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** after 图目录（本需求的证据目录；不存在就创建）。 */
const OUT_DIR = join(ROOT, 'docs', 'requirements', 'REQ-261006130057-7a43', 'evidence')

/** before 目录（上一轮已确认的 after 图 = 本轮的改前；**只读引用，一个字节都不写**）。 */
const BEFORE_DIR = join(ROOT, 'docs', 'requirements', 'REQ-261005155003-f32f', 'evidence')

/** 汇报 Tab 三组合（与 before 逐项同宽同状态）：1280×在途、900×在途、1280×终态。 */
interface Combo { readonly width: number; readonly state: SpecimenState }
const COMBOS: readonly Combo[] = [
  { width: 1280, state: 'inflight' },
  { width: 900, state: 'inflight' },
  { width: 1280, state: 'terminal' },
]

/** 面板补图（1280 × 在途）：#tab-verify（RTM 验收追踪列表）与 #tab-dialogue（聊天气泡）。 */
const PANEL_SHOTS: readonly { key: PanelSpecimenKey; file: string; label: string }[] = [
  { key: 'verify', file: 'ui-after-1280-inflight-verify.png', label: '#tab-verify RTM 验收追踪列表' },
  { key: 'dialogue', file: 'ui-after-1280-inflight-dialogue.png', label: '#tab-dialogue 聊天气泡 + 吸顶分页' },
]

/** 2 倍图（人看细节）：PNG 像素 = CSS 像素 × 本值（与 before 同口径，before/after 才可并排）。 */
const SCALE = 2

/** PNG 体量下限（字节）=「不像空白图」的粗筛（与 before 同口径）。 */
const MIN_PNG_BYTES = 20 * 1024

/** PNG 的 IHDR 宽高（字节 16..23，大端 uint32）——反推实测视口尺寸，不引图像库。 */
function pngSize(path: string): { w: number; h: number } | undefined {
  const head = readFileSync(path).subarray(0, 24)
  if (head.length < 24 || head.readUInt32BE(0) !== 0x89504e47 || head.readUInt32BE(4) !== 0x0d0a1a0a) {
    return undefined
  }
  return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) }
}

/** 一条可读行（缩进两格，与探针日志同款便于扫读）。 */
function line(text: string): void {
  console.log('  ' + text)
}

/** 跑一次 headless Chrome 出图（**只在"进程起不来"时重试一次**，与探针同口径）。 */
function shoot(chrome: string, args: string[]): void {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      execFileSync(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
      return
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/** 出一张图并做三件硬校验（文件在场 / 体量像话 / PNG 实测视口 = 期望），失败原因进 failures。 */
function shootOne(
  chrome: string, pageHtml: string, page: string, out: string,
  expectW: number, tag: string, failures: string[],
): void {
  writeFileSync(page, pageHtml)
  rmSync(out, { force: true })   // 先删旧图：否则 Chrome 没写出文件时旧图会被当成本轮产物
  try {
    shoot(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      `--force-device-scale-factor=${String(SCALE)}`,
      '--no-first-run', '--no-default-browser-check',
      // 等合成器把各阶段跑完再拍（emoji 字体回退是异步路径；与 before 同一纪律，图才可重复）
      '--run-all-compositor-stages-before-draw',
      `--window-size=${String(expectW)},${String(WINDOW_HEIGHT)}`,
      `--screenshot=${out}`, `file://${page}`,
    ])
  } catch (e) {
    const why = (e as Error).message.split('\n')[0]!.slice(0, 200)
    console.error(`FAIL ${tag}：Chrome 出图失败（${why}）`)
    failures.push(`${tag}：Chrome 出图失败（${why}）`)
    return
  }
  if (!existsSync(out)) {
    console.error(`FAIL ${tag}：截图文件没生成（${out}）`)
    failures.push(`${tag}：截图文件没生成`)
    return
  }
  const bytes = statSync(out).size
  const px = pngSize(out)
  if (bytes < MIN_PNG_BYTES || px === undefined) {
    const tail = px === undefined
      ? '不是合法 PNG（IHDR 读不出宽高）'
      : `体量 ${String(bytes)} 字节 < 下限 ${String(MIN_PNG_BYTES)} 字节（疑似空白图）`
    console.error(`FAIL ${tag}：${tail}`)
    failures.push(`${tag}：${tail}`)
    return
  }
  const vw = px.w / SCALE
  const vh = px.h / SCALE
  if (vw !== expectW || vh !== WINDOW_HEIGHT) {
    console.error(`FAIL ${tag}：PNG 实测视口 ${String(vw)}×${String(vh)} ≠ 期望 ${String(expectW)}×${String(WINDOW_HEIGHT)}`
      + '（与 before 不同口径 → before/after 不可比）')
    failures.push(`${tag}：PNG 实测视口 ${String(vw)}×${String(vh)} ≠ 期望 ${String(expectW)}×${String(WINDOW_HEIGHT)}`)
    return
  }
  console.log(`OK ${tag}`)
  line(`产物：${out}`)
  line(`体量：${String(bytes)} 字节（${(bytes / 1024).toFixed(0)} KB）｜ PNG ${String(px.w)}×${String(px.h)} 像素`
    + ` = CSS 视口 ${String(vw)}×${String(vh)}（${String(SCALE)} 倍图）`)
}

/** 文件 sha256（before 副本一致性判据；体量相同但内容被换也要判红）。 */
function sha256Of(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function main(): void {
  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('SHOT FAIL（环境不可用，退出码 2）：找不到 Chrome。')
    console.error('修复：安装 Google Chrome，或设置环境变量 CHROME_BIN 指向可执行文件。')
    console.error('本机常见落点：/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    process.exit(2)
  }
  console.log(`需求详情页 before/after 对照出图（REQ-261006130057-7a43 · after = 当前实现 · ${String(SCALE)} 倍图）`)
  console.log(`Chrome：${chrome}`)

  const failures: string[] = []

  /* before 引用核对（不重拍）：上一轮已确认的 after 图 = 本轮改前；缺档 = 对照链断，响亮失败。 */
  console.log('\n[before] 复用上一轮 REQ-261005155003-f32f 已确认的 after 图（路径引用，不重拍）：')
  for (const combo of COMBOS) {
    const before = join(BEFORE_DIR, `ui-after-${String(combo.width)}-${combo.state}.png`)
    const label = STATES.find(s => s.key === combo.state)?.label ?? combo.state
    if (!existsSync(before)) {
      console.error(`FAIL before 缺档：${before}（${String(combo.width)} × ${label}）`)
      failures.push(`before 缺档：${before}`)
    } else {
      line(`${String(combo.width)} × ${label}：${before}（${String(statSync(before).size)} 字节）`)
    }
    /* 本需求 evidence/ 里的自足副本（复核 P2-3）：三张 before 必须逐字节等同源图——
       副本被删/被换 → 判红，不靠人记得「权威在 f32f」。 */
    const copy = join(OUT_DIR, `ui-before-${String(combo.width)}-${combo.state}.png`)
    if (!existsSync(copy)) {
      console.error(`FAIL before 副本缺档：${copy}（对照证据要自足）`)
      failures.push(`before 副本缺档：${copy}`)
    } else if (sha256Of(copy) !== sha256Of(before)) {
      console.error(`FAIL before 副本与源图不一致（sha256 不同）：${copy} vs ${before}`)
      failures.push(`before 副本与源图不一致：${copy}`)
    }
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const dir = mkdtempSync(join(tmpdir(), 'pm-req-7a43-shot-'))

  try {
    console.log('\n[after · 汇报 Tab] 1280/900 × 在途 + 1280 × 终态（与 before 逐项同宽同状态）：')
    for (const combo of COMBOS) {
      const { width, state } = combo
      const label = STATES.find(s => s.key === state)?.label ?? state
      const page = join(dir, `${String(width)}-${state}.html`)
      const out = join(OUT_DIR, `ui-after-${String(width)}-${state}.png`)
      shootOne(
        chrome,
        specimenShell(width, state, '', `pmboard 需求详情页 after 截图（REQ-7a43）· ${String(width)} · ${label}`),
        page, out, width, `w=${String(width)} ${label}`, failures,
      )
    }

    console.log('\n[after · 面板补图] #tab-verify / #tab-dialogue（1280 × 在途）：')
    for (const shot of PANEL_SHOTS) {
      const page = join(dir, `panel-${shot.key}.html`)
      const out = join(OUT_DIR, shot.file)
      shootOne(
        chrome,
        specimenShellForPanel(1280, 'inflight', shot.key, '',
          `pmboard 需求详情页 after 截图（REQ-7a43）· 1280 · 在途 · ${shot.label}`),
        page, out, 1280, `1280 在途 ${shot.label}`, failures,
      )
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  if (failures.length > 0) {
    console.error('\nSHOT FAIL')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }
  const total = COMBOS.length + PANEL_SHOTS.length
  console.log(`\nSHOT PASS（${String(total)}/${String(total)} 张 after：1280×在途 / 900×在途 / 1280×终态 / verify / dialogue；`
    + `before 三档引用齐；目录 ${OUT_DIR}）`)
}

main()
