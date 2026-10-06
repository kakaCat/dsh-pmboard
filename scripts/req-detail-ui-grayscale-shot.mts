/**
 * 需求详情页「灰度评审」出图（REQ-261005155003-f32f · t-cdb864 / FR-8 #3）。
 *
 * 为什么需要它：FR-8 的判据只有一半能机器判（元素内有没有真实文本 / svg 子节点），
 * 另一半是**人眼**判："把颜色抽掉之后，三态还分得出来吗"。分不出来就说明信息仍然只挂在颜色上，
 * 而颜色对色觉障碍用户与灰度打印是不存在的。
 *
 * 做法：同一份标本（`fixtures/req-detail-specimen.mts`，与探针/出图脚本**同一份**载荷）
 * 注入 `filter: grayscale(1)` 后出 PNG，只写 `ui-gray-*.png`（不碰任何 before/after 图）。
 * 判读靠人：图里阶段条（✓ / ▸ / 无）、缺口条（!! / ! / ·）与验收结论（文字结论）应当仍可区分。
 *
 * 用法：npx tsx scripts/req-detail-ui-grayscale-shot.mts
 * 退出码：0 = 两张图都产出；2 = 环境不可用（找不到 Chrome）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findChrome, specimenShell, WINDOW_HEIGHT, type SpecimenState } from './fixtures/req-detail-specimen.mts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'docs', 'requirements', 'REQ-261005155003-f32f', 'evidence')

/** 两张图：1280 档的在途与终态（终态才有验收结论可见）。 */
const SHOTS: readonly { readonly state: SpecimenState; readonly file: string }[] = [
  { state: 'inflight', file: 'ui-gray-1280-inflight.png' },
  { state: 'terminal', file: 'ui-gray-1280-terminal.png' },
]

/** 灰度注入：`filter` 加在最外层（`.dsh-pm-view` 是真实宿主类，见标本模块注释）。 */
const GRAY_CSS = '<style>.dsh-pm-view { filter: grayscale(1); }</style>'

function main(): void {
  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('GRAYSHOT FAIL（环境不可用，退出码 2）：本机候选路径里没有 Chrome（CHROME_BIN 也未设置）。')
    process.exit(2)
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  const dir = mkdtempSync(join(tmpdir(), 'pm-req-gray-'))
  try {
    for (const shot of SHOTS) {
      // 标本页的 bodyScript 挂空串：出图不需要页内脚本；灰度样式插在壳前。
      const page = join(dir, shot.state + '.html')
      writeFileSync(page, specimenShell(1280, shot.state, GRAY_CSS, 'pmboard 详情页灰度评审 · ' + shot.state))
      const out = join(OUT_DIR, shot.file)
      execFileSync(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--force-device-scale-factor=2', '--run-all-compositor-stages-before-draw',
        `--window-size=1280,${String(WINDOW_HEIGHT)}`, `--screenshot=${out}`, `file://${page}`,
      ], { stdio: ['ignore', 'pipe', 'ignore'] })
      console.log('出图：' + out)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  console.log('GRAYSHOT OK（两张灰度图；判读靠人：阶段条 ✓/▸/无、缺口 !! / ! / ·、验收结论文字应仍可区分）')
}

main()
