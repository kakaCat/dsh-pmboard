/**
 * 需求详情页「工作汇报」**改动前基线截图**（before 图）— REQ-261005155003-f32f。
 *
 * 为什么需要它：本需求是「需求详情页 UI 优化」，评审的是**版面长相**（头部信息层级、状态带三格
 * 的疏密、Tab 栏落点、首屏塞不塞得下），不是"某条断言过不过"。这类改动**只能靠图对照**——
 * 优化前长什么样、优化后变成什么样，必须能并排看，而不是靠人对上一版的记忆或文字描述
 * （本仓注释与实现已出现过不一致，文字描述现状更不可信）。`scripts/req-report-probe.mts` 是
 * 同一份标本的**只 dump DOM、不出图**探针：它证明几何合法，但证明不了"看起来好不好"。
 * 本脚本补上后者：真渲染 + 真 CSS + headless Chrome 出 PNG。
 *
 * 用法：npx tsx scripts/req-detail-ui-shot.mts
 *
 * 产物（3 张 PNG，2 倍图便于人看细节；产出目录不存在时自动创建，重复运行幂等覆盖）：
 *   docs/requirements/REQ-261005155003-f32f/evidence/ui-before-1280-inflight.png  （1280 宽 × 在途 implementing）
 *   docs/requirements/REQ-261005155003-f32f/evidence/ui-before-900-inflight.png   （900 窄档 × 在途 implementing）
 *   docs/requirements/REQ-261005155003-f32f/evidence/ui-before-1280-terminal.png  （1280 宽 × 终态 archived）
 *
 * 退出码：0 = 三张图都出好了；1 = 有图没出成 / 出的图不像话（尺寸或体量不对，响亮失败）；
 *         2 = 环境不可用（找不到 Chrome），打修复指引，不静默跳过。
 *
 * ── 视口口径：**实测 CSS 1280×800 / 900×800**（本脚本按 PNG 像素反推并打印，可复核）──
 * 用 `--window-size=<w>,800` + `--force-device-scale-factor=2`：PNG 像素 = CSS 像素 × 2
 * （1280 档 → 2560×1600，900 档 → 1800×1600；实测视口高 **800**，不是 713）。
 *
 * 为什么不是探针那个 713：**713 是 `--dump-dom` 口径**（同参数实测 `clientHeight=713`，
 * 窗口高 800 里含约 87px 外框）。而带 `--screenshot` 时 Chrome 按 `--window-size` 直接**按该
 * 尺寸出图**（同参数实测 `outerHeight=800`，且 PNG 逐行有内容直到 CSS 799 —— 即 800 这一段
 * 是真的被布局出来的，不是 713 布局 + 87px 空白）。两条口径都实测过，见下方常量注释里的复核方法。
 * 后果是好的：探针在**更严的 713** 上已全过（`TABS_TOP_MAX=713` 那条硬判据），
 * 所以这张 800 的图**必然覆盖探针判定的整个首屏**，另外还多看到约 87px。
 * 脚本保留一条下限判据：实测视口高 < 713（PROBE_FIRST_SCREEN_VH）即算失败——
 * 那意味着图比探针的首屏还窄，before 基线会缺内容。
 *
 * 这一屏就是「首屏」：壳是 `height:100%` + `.dsh-pm-detail` 内部滚动，document 本身不滚动，
 * 所以截图正好等于首屏（不会被拉成整页长图）。
 *
 * ── 关于「仅截图用 CSS」──
 * 本脚本**不注入任何**仅截图用的 CSS：标本页自带 `html, body { margin:0; height:100%;
 * background: var(--dsw-bg-primary,#fff) }` 与字体栈，出的图就是真实页面吃同一套样式的结果。
 * 若将来确实要注入（例如给 body 加底色），只能加在标本页里，并且必须在此注明
 * 「仅样品页，不影响真实页面」——**绝不允许**为了图好看去改 `src/` 的样式。
 *
 * 标本（mock 数据 + 真实 `buildReportShell` 拼页 + 全量真实 CSS）来自
 * `./fixtures/req-detail-specimen.mts`，与探针共用同一份，避免两处标本漂移。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  STATES, WINDOW_HEIGHT, findChrome, specimenShell, type SpecimenState,
} from './fixtures/req-detail-specimen.mts'

/** 三组合（每组合一张 PNG）：1280×在途、900×在途、1280×终态。 */
interface Combo { readonly width: number; readonly state: SpecimenState }
const COMBOS: readonly Combo[] = [
  { width: 1280, state: 'inflight' },
  { width: 900, state: 'inflight' },
  { width: 1280, state: 'terminal' },
]

/** 仓库根（本脚本在 `<root>/scripts/` 下），产物路径相对它解析——不依赖调用时的 cwd。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 产物目录（本需求的证据目录；不存在就创建）。 */
const OUT_DIR = join(ROOT, 'docs', 'requirements', 'REQ-261005155003-f32f', 'evidence')

/** 2 倍图（人看细节）：PNG 像素 = CSS 像素 × 本值。 */
const SCALE = 2

/**
 * 探针口径的实测首屏视口高（px）= `scripts/req-report-probe.mts` 里 `TABS_TOP_MAX` 的那个 713
 * （`--dump-dom` + `--window-size=*，800` 实测得到；窗口高 800 含约 87px 浏览器外框）。
 *
 * 出图用的 `--screenshot` 口径实测是 800（见模块注释）。这里不要求两者相等（那是 Chrome
 * 的实现细节，跨版本会变），只要求**出图视口不比探针首屏矮**——矮了就等于基线图缺了探针
 * 判定过的内容，before/after 对照会失真。复核方法：
 *   `--dump-dom` 跑同一份标本 + 页内写 `document.documentElement.clientHeight` → 得 713；
 *   `--screenshot` 出的 PNG 读 IHDR 高 ÷ 2 → 得 800。
 */
const PROBE_FIRST_SCREEN_VH = 713

/**
 * PNG 体量下限（字节）= 「不像空白图」的粗筛。
 *
 * 这一屏是浅底 + 文字，2 倍图正常在几十~几百 KB；全白空图会被 PNG 压到几 KB。
 * 设下限是为了让"Chrome 起了、但页面根本没渲染出东西"也**响亮失败**，而不是交出一张白图。
 * 实测三张分别是 455 KB / 395 KB / 332 KB，全白空图只会有几 KB——20 KB 这个值只筛"几乎全空"，
 * 不做像素级判据（也不该做：那样等于把截图脚本变成视觉回归测试，本卡只要 before 基线）。
 */
const MIN_PNG_BYTES = 20 * 1024

/** PNG 的 IHDR 宽高（字节 16..23，大端 uint32）——用来反推实测视口尺寸，不引图像库。 */
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

/**
 * 跑一次 headless Chrome 出图。
 *
 * **只在"进程起不来"时重试一次**（与探针同口径）：并行跑多个 headless Chrome 时偶发启动失败，
 * 一次重试把「环境抖动」与「页面真的出不了图」分开；出图后再按文件本体判成败（不看退出码自述）。
 */
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

function main(): void {
  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('SHOT FAIL（环境不可用，退出码 2）：找不到 Chrome。')
    console.error('修复：安装 Google Chrome，或设置环境变量 CHROME_BIN 指向可执行文件。')
    console.error('本机常见落点：/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    process.exit(2)
  }
  console.log(`需求详情页 before 基线截图（真实渲染 · ${String(SCALE)} 倍图 · 视口宽高见下）`)
  console.log(`Chrome：${chrome}`)

  mkdirSync(OUT_DIR, { recursive: true })
  const dir = mkdtempSync(join(tmpdir(), 'pm-req-detail-shot-'))
  const failures: string[] = []

  try {
    for (const combo of COMBOS) {
      const { width, state } = combo
      const label = STATES.find(s => s.key === state)?.label ?? state
      const page = join(dir, `${String(width)}-${state}.html`)
      const out = join(OUT_DIR, `ui-before-${String(width)}-${state}.png`)

      /* ⚠️ 改前基线**是一次性产物**：它记录的是"改动之前长什么样"，一旦被覆盖，对照基准就没了。
         2026-10-05 真实发生过：有人重跑本脚本，三张 before 图被换成改动后的样子
         （`ui-before-*` 与 `ui-after-*` 的 sha256 完全相同，对照彻底失效，最后只能回 HEAD 重建）。
         因此默认**拒绝**覆盖已存在的基线；确实要重录基线（例如换了标本口径）时显式加
         `--force-baseline`，并在需求评论里写明为什么。 */
      if (existsSync(out) && process.argv.indexOf('--force-baseline') < 0) {
        failures.push(`改前基线已存在，拒绝覆盖：${out}（要重录基线请显式加 --force-baseline，并写明原因）`)
        continue
      }

      // 标本页 = 共享模块拼的真实壳 + 真实 CSS；bodyScript 给空串（这是出图，不插断言脚本）。
      // 标题带上用途与组合，方便单开这份 HTML 时知道它是哪一屏。
      writeFileSync(page, specimenShell(
        width, state, '',
        `pmboard 需求详情页 before 基线截图 · ${String(width)} · ${label}`,
      ))

      // **先删旧图**：否则 Chrome 万一没写出文件，上一轮的旧图会被当成本轮产物（幂等覆盖的前提）。
      rmSync(out, { force: true })

      try {
        shoot(chrome, [
          '--headless=new', '--disable-gpu', '--hide-scrollbars',
          `--force-device-scale-factor=${String(SCALE)}`,
          '--no-first-run', '--no-default-browser-check',
          // 让合成器把所有阶段跑完再拍：状态带里的 ✅/⚠️ 走系统 emoji 字体回退，那是一条**异步**路径，
          // 不等它就偶发拍到"字体还没换好"的一帧（实测撞到过一次：终态那张同一份标本、同一套参数，
          // 出图 339464 → 326951 字节，图画出来不一样）。基线图要求可重复，所以把这一步焊死。
          // 注意**不要**改用 `--virtual-time-budget`：实测它会把不确定性放大（5 次里 2 次抖动，
          // 连 900 档都开始翻），那条路走过、退回来了。
          '--run-all-compositor-stages-before-draw',
          `--window-size=${String(width)},${String(WINDOW_HEIGHT)}`,
          `--screenshot=${out}`, `file://${page}`,
        ])
      } catch (e) {
        // Chrome 的报错含整条命令行（很长），只留首行——「一行可读原因」。
        const why = (e as Error).message.split('\n')[0]!.slice(0, 200)
        console.error(`FAIL w=${String(width)} ${label}：Chrome 出图失败（${why}）`)
        failures.push(`w=${String(width)} ${state}：Chrome 出图失败（${why}）`)
        continue
      }

      if (!existsSync(out)) {
        console.error(`FAIL w=${String(width)} ${label}：截图文件没生成（${out}）`)
        failures.push(`w=${String(width)} ${state}：截图文件没生成`)
        continue
      }
      const bytes = statSync(out).size
      const px = pngSize(out)
      if (bytes < MIN_PNG_BYTES || px === undefined) {
        const tail = px === undefined
          ? '不是合法 PNG（IHDR 读不出宽高）'
          : `体量 ${String(bytes)} 字节 < 下限 ${String(MIN_PNG_BYTES)} 字节（疑似空白图）`
        console.error(`FAIL w=${String(width)} ${label}：${tail}`)
        failures.push(`w=${String(width)} ${state}：${tail}`)
        continue
      }

      // 视口口径自证：PNG 像素 ÷ 2 应回到该档 CSS 宽度，且实测视口高不得矮于探针首屏（713）。
      const vw = px.w / SCALE
      const vh = px.h / SCALE
      if (vw !== width) {
        console.error(`FAIL w=${String(width)} ${label}：PNG 实测视口宽 ${String(vw)} ≠ 期望 ${String(width)}（--window-size 未生效？）`)
        failures.push(`w=${String(width)} ${state}：PNG 实测视口宽 ${String(vw)} ≠ 期望 ${String(width)}`)
        continue
      }
      if (vh < PROBE_FIRST_SCREEN_VH) {
        console.error(`FAIL w=${String(width)} ${label}：PNG 实测视口高 ${String(vh)} < 探针首屏 ${String(PROBE_FIRST_SCREEN_VH)}`
          + '（图比探针判定的首屏还窄，before 基线会缺内容）')
        failures.push(`w=${String(width)} ${state}：PNG 实测视口高 ${String(vh)} < 探针首屏 ${String(PROBE_FIRST_SCREEN_VH)}`)
        continue
      }
      console.log(`OK w=${String(width)} ${label}`)
      line(`产物：${out}`)
      line(`体量：${String(bytes)} 字节（${(bytes / 1024).toFixed(0)} KB）｜ PNG ${String(px.w)}×${String(px.h)} 像素`
        + ` = CSS 视口 ${String(vw)}×${String(vh)}（${String(SCALE)} 倍图）`)
      line(`视口：宽 ${String(vw)}（= ${String(width)} ✓）｜ 高 ${String(vh)}`
        + `（= --window-size 高 ${String(WINDOW_HEIGHT)}；--screenshot 下 Chrome 按该尺寸出图，`
        + `**不是**探针的 ${String(PROBE_FIRST_SCREEN_VH)}）`)
      line(`覆盖：本图已含探针判定的整个首屏（${String(PROBE_FIRST_SCREEN_VH)}px），并多出 ${String(vh - PROBE_FIRST_SCREEN_VH)}px`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  if (failures.length > 0) {
    console.error('\nSHOT FAIL')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }
  console.log(`\nSHOT PASS（${String(COMBOS.length)}/${String(COMBOS.length)} 张：1280×在途 inflight / 900×在途 inflight / 1280×终态 terminal；`
    + `目录 ${OUT_DIR}）`)
}

main()
