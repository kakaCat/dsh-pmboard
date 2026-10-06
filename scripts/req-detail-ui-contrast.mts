/**
 * 需求详情页「对比度报表」（REQ-261005155003-f32f · t-fcdf91 · FR-4 #7/#8/#9）。
 *
 * 为什么需要它：FR-4 的判据不是"把三个色值改深"，而是**达标靠算不靠看**——每个前景/背景对
 * 都要按 WCAG 相对亮度公式给出实测比值，并且要覆盖 `evidence/contrast-baseline.txt` 里漏掉的两类关系：
 *   ① **组合背景**（文字压在同色浅底上，不是"深字压白底"）；
 *   ② **反白关系**（白字压主色底的主按钮）。
 * 靠眼睛挑不出来的正是这两类（主按钮与三档芯片就是这么漏掉的）。
 *
 * 三条纪律：
 *  - **不许复制一份色值**：令牌一律从 `src/client/styles/report.ts` 的声明里解析（唯一事实源），
 *    两处各写一份必然漂移——改了一处、报表还是绿的，那是最坏的一种"看起来有判据"；
 *  - **浅色岛口径**：背景恒为白（`#ffffff`），出现 `[data-ds-dark-theme]` 对详情页的任何覆盖
 *    即判失败（FR-4 #3：岛内不许被宿主主题翻转）；
 *  - **豁免要逐条登记**：纯装饰发丝线与"未开始"进度段不承载信息（WCAG 1.4.11 的"可通过其它方式识别"），
 *    只打印比值、不计判——但**必须出现在报表里**，静默略过就等于把取舍藏起来。
 *
 * 用法：npx tsx scripts/req-detail-ui-contrast.mts
 * 退出码：0 = 全部计判项达标；1 = 有计判项不达标（逐条点名）；2 = 环境不可用（读不到 report.ts）。
 * 报表同时写到 `docs/requirements/REQ-261005155003-f32f/evidence/contrast-report.txt`。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STYLES = join(ROOT, 'src', 'client', 'styles', 'report.ts')
const OUT_DIR = join(ROOT, 'docs', 'requirements', 'REQ-261005155003-f32f', 'evidence')
const OUT_FILE = join(OUT_DIR, 'contrast-report.txt')

/** 浅色岛的表面（报表里所有背景的基准）。 */
const WHITE = '#ffffff'

/* ────────────────────────────── 颜色与 WCAG 数学 ────────────────────────────── */

interface Rgb { r: number; g: number; b: number }

/** `#rgb` / `#rrggbb` / `#rrggbbaa` → RGB（alpha 交给 {@link overWhite} 合成）。 */
function parseHex(raw: string): { rgb: Rgb; alpha: number } | undefined {
  const m = /^#([0-9a-f]{3,8})$/i.exec(raw.trim())
  if (m === null) return undefined
  let h = m[1]!
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length !== 6 && h.length !== 8) return undefined
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  return { rgb: { r, g, b }, alpha }
}

/** `rgba(r, g, b, a)` → RGB（alpha 交给 {@link over} 合成；`g`/`b` 允许省略）。 */
function parseRgba(raw: string): { rgb: Rgb; alpha: number } | undefined {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i.exec(raw.trim())
  if (m === null) return undefined
  return {
    rgb: { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) },
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  }
}

/** 任意 css 颜色文本（十六进制或 `rgba()`）→ 压在白底上的 RGB。 */
function parseColorOnWhite(raw: string): Rgb | undefined {
  const hexed = parseHex(raw)
  if (hexed !== undefined) return over(hexed.rgb, hexed.alpha, { r: 255, g: 255, b: 255 })
  const rgba = parseRgba(raw)
  if (rgba !== undefined) return over(rgba.rgb, rgba.alpha, { r: 255, g: 255, b: 255 })
  return undefined
}

/** 把带 alpha 的前景压到背景上（WCAG 要求先合成再算亮度）。 */
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
  }
}

/** 12% 同色浅底（组合背景的构造口径：语义色 12% 压在白岛上）。 */
function tintOf(base: Rgb, ratio: number, bg: Rgb = { r: 255, g: 255, b: 255 }): Rgb {
  return {
    r: Math.round(base.r * ratio + bg.r * (1 - ratio)),
    g: Math.round(base.g * ratio + bg.g * (1 - ratio)),
    b: Math.round(base.b * ratio + bg.b * (1 - ratio)),
  }
}

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG 相对亮度。 */
function luminance(c: Rgb): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

/** 对比度（≥1；同色 = 1）。 */
function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

function hex(c: Rgb): string {
  return '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('')
}

/* ────────────────────────────── 令牌解析（唯一事实源） ────────────────────────────── */

/**
 * 从样式分片解析 `--pm-*` 声明。**取首次出现**：令牌定义块在文件最前，后面的都是局部用法
 * （局部很少再声明同名令牌；真出现也不可能早于定义块）。
 */
function parseTokens(src: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /--([a-z0-9-]+)\s*:\s*([^;{}]+);/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const name = '--' + m[1]!
    if (!out.has(name)) out.set(name, m[2]!.trim())
  }
  return out
}

/** `var(--x)` 解引用（最多 8 层，遇到环即抛）。 */
function resolve(name: string, tokens: Map<string, string>): string {
  let value = tokens.get(name)
  if (value === undefined) throw new Error('令牌未声明：' + name)
  for (let i = 0; i < 8; i++) {
    const m = /^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i.exec(value.trim())
    if (m === null) return value
    value = tokens.get(m[1]!)
    if (value === undefined) throw new Error('令牌 ' + name + ' 引用了未声明的 ' + m[1]!)
  }
  throw new Error('令牌解引用超过 8 层（疑似循环）：' + name)
}

/** 令牌 → RGB（解引用 + 按浅色岛白底合成 alpha）。 */
function colorOf(name: string, tokens: Map<string, string>): { rgb: Rgb; raw: string } {
  const value = resolve(name, tokens)
  const parsed = parseHex(value)
  if (parsed === undefined) throw new Error('令牌 ' + name + ' 的取值不是十六进制颜色：' + value)
  return { rgb: over(parsed.rgb, parsed.alpha, { r: 255, g: 255, b: 255 }), raw: value }
}

/* ────────────────────────────── 判据表 ────────────────────────────── */

interface TextCheck { label: string; token: string; onToken?: string; onHex?: Rgb }
interface ExemptCheck { label: string; token: string; why: string }
interface TintCheck { label: string; token: string; baseToken: string }

const TEXT_MIN = 4.5
const NON_TEXT_MIN = 3

/** A. 真文字（阈值 4.5:1）——含**反白**与**组合背景**两类，不只"深字压白底"。 */
const TEXT_CHECKS: TextCheck[] = [
  { label: '正文', token: '--pm-text' },
  { label: '次要文字', token: '--pm-text2' },
  { label: '文字级主色（选中 Tab / 链接式按钮 / 人名）', token: '--pm-accent-text' },
  { label: '危险文字（阻塞 / 取消）', token: '--pm-danger' },
  { label: '警告文字', token: '--pm-warn-text' },
  { label: '成功文字', token: '--pm-ok-text' },
  { label: '验收态（青）', token: '--pm-teal-text' },
  { label: 'agent 署名', token: '--pm-agent' },
  /* 反白关系（FR-4 #8）：主按钮 = 白字压主色底——只算"深字压白底"必然会漏掉这一条。 */
  { label: '主按钮（白字压主色底，反白）', token: '--pm-text-on-accent', onToken: '--pm-accent' },
]

/** B. 有意义的非文本（阈值 3:1）：图标 / 进度条 / 焦点环 / 严重度标记。 */
const NON_TEXT_CHECKS: TextCheck[] = [
  { label: '焦点环（文字级主色）', token: '--pm-accent-text' },
  { label: '进度条当前与完成段', token: '--pm-accent' },
  { label: 'Tab 图标（未选中，继承文字色）', token: '--pm-text2' },
  { label: 'Tab 图标（选中）', token: '--pm-accent-text' },
  { label: '缺口严重度标记 red', token: '--pm-danger' },
  { label: '缺口严重度标记 yellow', token: '--pm-warn-text' },
  { label: '缺口严重度标记 gray', token: '--pm-text2' },
  { label: '装饰性图标（三级色，仅非文本）', token: '--pm-text3' },
]

/** C. 纯装饰（只登记不计判，WCAG 1.4.11 的"可通过其它方式识别"）。 */
const EXEMPT_CHECKS: ExemptCheck[] = [
  { label: '发丝分隔线', token: '--pm-line', why: '不标识控件/状态；两侧有文字与留白' },
  { label: '更强分隔线', token: '--pm-line-strong', why: '同上，仅加重分隔' },
  { label: '进度条未开始段', token: '--pm-bg-soft', why: '未开始段不承载信息，两侧有阶段名文字' },
  { label: '焦点环 halo', token: '--pm-focus-halo', why: '装饰性光晕，承担对比度的是 outline 本身' },
]

/** D. 芯片 tint 三条（FR-4 #6：FR-10 取消 12% 底色块后**备而未用**，但必须仍达标）。 */
interface TintCheck { label: string; token: string; baseToken: string; bg: string; bgWhy: string }

const TINT_CHECKS: TintCheck[] = [
  { label: '成功芯片文字（备而未用）', token: '--pm-ok-text-tint', baseToken: '--pm-ok-text', bg: 'rgba(40,167,69,.13)', bgWhy: '旧「已归档 / 验收通过」芯片底色' },
  { label: '验收态芯片文字（备而未用）', token: '--pm-teal-text-tint', baseToken: '--pm-teal-text', bg: 'rgba(23,162,184,.14)', bgWhy: '旧「验收中」芯片底色' },
  { label: '危险芯片文字（备而未用）', token: '--pm-danger-text', baseToken: '--pm-danger', bg: 'rgba(220,53,69,.12)', bgWhy: '旧「阻塞 / 取消」芯片底色' },
]

/** 浅色岛不许出现的宿主令牌（FR-4 #5 / 验收锚点：grep 断言）。 */
const FORBIDDEN_HOST_TOKENS = [
  '--dsw-alias-label-tertiary',
  '--dsw-text-primary',
  '--dsw-text-secondary',
  '--dsw-text-tertiary',
  '--dsw-accent',
  '--dsw-bg-primary',
  '--dsw-bg-secondary',
  '--dsw-border',
]

/* ────────────────────────────── 主流程 ────────────────────────────── */

function main(): void {
  if (!existsSync(STYLES)) {
    console.error('CONTRAST FAIL（环境不可用，退出码 2）：读不到 ' + STYLES)
    process.exit(2)
  }
  const src = readFileSync(STYLES, 'utf8')
  const tokens = parseTokens(src)
  /* 白字压主色底：`#ffffff` 不是令牌，用一个合成名走同一条解析路径（保住"只有一份取值口径"）。 */
  if (!tokens.has('--pm-text-on-accent')) tokens.set('--pm-text-on-accent', WHITE)

  const lines: string[] = []
  const problems: string[] = []
  const title = '需求详情页 · 对比度报表（WCAG 2.x 相对亮度公式，读 src/client/styles/report.ts 的令牌声明）'
  lines.push(title)
  lines.push('口径：详情页是白底浅色岛（背景 #ffffff）；alpha 一律先压到白底再算亮度。')
  lines.push('阈值：真文字 >= ' + TEXT_MIN.toFixed(1) + ':1；有意义的非文本 >= ' + String(NON_TEXT_MIN) + ':1。')
  lines.push('')

  lines.push('== A. 真文字（阈值 ' + TEXT_MIN.toFixed(1) + ':1）==')
  for (const c of TEXT_CHECKS) {
    const fg = colorOf(c.token, tokens)
    const bg = c.onToken === undefined ? { r: 255, g: 255, b: 255 } : colorOf(c.onToken, tokens).rgb
    const ratio = contrast(fg.rgb, bg)
    const ok = ratio >= TEXT_MIN
    if (!ok) problems.push('A 真文字不达标：' + c.label + ' ' + hex(fg.rgb) + ' on ' + hex(bg) + ' = ' + ratio.toFixed(2) + ':1 < ' + TEXT_MIN.toFixed(1) + ':1')
    lines.push(pad(c.label, 44) + pad(hex(fg.rgb) + ' on ' + hex(bg), 26) + pad(ratio.toFixed(2) + ':1', 10) + (ok ? 'PASS' : 'FAIL'))
  }
  lines.push('')

  lines.push('== B. 有意义的非文本（阈值 ' + String(NON_TEXT_MIN) + ':1）==')
  for (const c of NON_TEXT_CHECKS) {
    const fg = colorOf(c.token, tokens)
    const ratio = contrast(fg.rgb, { r: 255, g: 255, b: 255 })
    const ok = ratio >= NON_TEXT_MIN
    if (!ok) problems.push('B 非文本不达标：' + c.label + ' ' + hex(fg.rgb) + ' on #ffffff = ' + ratio.toFixed(2) + ':1 < ' + String(NON_TEXT_MIN) + ':1')
    lines.push(pad(c.label, 44) + pad(hex(fg.rgb) + ' on #ffffff', 26) + pad(ratio.toFixed(2) + ':1', 10) + (ok ? 'PASS' : 'FAIL'))
  }
  lines.push('')

  lines.push('== C. 纯装饰（只登记不计判，WCAG 1.4.11「可通过其它方式识别」）==')
  for (const c of EXEMPT_CHECKS) {
    if (c.token === '--pm-focus-halo') {
      const value = resolve(c.token, tokens)
      lines.push(pad(c.label, 44) + pad(value, 26) + pad('—', 10) + 'EXEMPT（' + c.why + '）')
      continue
    }
    const fg = colorOf(c.token, tokens)
    const ratio = contrast(fg.rgb, { r: 255, g: 255, b: 255 })
    lines.push(pad(c.label, 44) + pad(hex(fg.rgb) + ' on #ffffff', 26) + pad(ratio.toFixed(2) + ':1', 10) + 'EXEMPT（' + c.why + '）')
  }
  lines.push('')

  lines.push('== D. 芯片 tint 三条（组合背景：文字压在旧同色浅底上；FR-10 后**备而未用**，仍须达标）==')
  lines.push('   底色口径：这三个令牌是"某处若再出现同色浅底芯片就启用"的备用品，故按**旧芯片真实的浅底**取值')
  lines.push('   （下列 rgba，合成到白岛后即为判据背景）——不是"语义色 12%"（那个口径更浅，见 D2 仅供参考）。')
  for (const c of TINT_CHECKS) {
    const fg = colorOf(c.token, tokens)
    const bg = parseColorOnWhite(c.bg)
    if (bg === undefined) { problems.push('D 底色解析失败：' + c.bg); continue }
    const ratio = contrast(fg.rgb, bg)
    const ok = ratio >= TEXT_MIN
    if (!ok) problems.push('D 组合背景不达标：' + c.label + ' ' + hex(fg.rgb) + ' on ' + hex(bg) + ' = ' + ratio.toFixed(2) + ':1 < ' + TEXT_MIN.toFixed(1) + ':1')
    lines.push(pad(c.label, 44) + pad(hex(fg.rgb) + ' on ' + hex(bg), 26) + pad(ratio.toFixed(2) + ':1', 10) + (ok ? 'PASS' : 'FAIL'))
    lines.push(pad('   （' + c.bgWhy + '，' + c.bg + '）', 44))
  }
  lines.push('   D2 仅供参考（语义色 12% 合成口径，**不计判**）：')
  for (const c of TINT_CHECKS) {
    const fg = colorOf(c.token, tokens)
    const bg = tintOf(colorOf(c.baseToken, tokens).rgb, 0.12)
    lines.push(pad('   ' + c.label, 44) + pad(hex(fg.rgb) + ' on ' + hex(bg), 26) + pad(contrast(fg.rgb, bg).toFixed(2) + ':1', 10) + 'INFO')
  }
  lines.push('')

  /* 口径判据：浅色岛不许被宿主主题翻转（FR-4 #3）——报表出现它的任何影响即判失败。 */
  lines.push('== E. 浅色岛口径（FR-4 #3）==')
  const darkHits = (src.match(/data-ds-dark-theme/g) ?? []).length
  lines.push(pad('report.ts 引用 [data-ds-dark-theme] 次数', 44) + pad(String(darkHits), 26) + pad('0', 10) + (darkHits === 0 ? 'PASS' : 'FAIL'))
  if (darkHits > 0) problems.push('E 浅色岛口径：report.ts 仍引用 [data-ds-dark-theme] ' + String(darkHits) + ' 处（宿主深色主题会翻转岛内前景色）')
  for (const t of FORBIDDEN_HOST_TOKENS) {
    const hits = src.split(t).length - 1
    lines.push(pad('不再引用宿主令牌 ' + t, 44) + pad(String(hits) + ' 处', 26) + pad('0', 10) + (hits === 0 ? 'PASS' : 'FAIL'))
    if (hits > 0) problems.push('E 浅色岛口径：report.ts 仍引用宿主令牌 ' + t + '（' + String(hits) + ' 处）')
  }
  lines.push('')

  /* 备而未用三值的在场性（`grep -c` 判据的脚本化）：令牌缺一个，将来真要用时就地补一份新值 = 两处漂移。 */
  lines.push('== F. tint 备用令牌在场（FR-4 #6）==')
  for (const c of TINT_CHECKS) {
    const present = tokens.has(c.token)
    lines.push(pad(c.token + ' 已声明', 44) + pad(present ? '在场' : '缺失', 26) + pad('—', 10) + (present ? 'PASS' : 'FAIL'))
    if (!present) problems.push('F 备用令牌缺失：' + c.token + '（FR-4 #6 要求随实施交付，备而未用）')
  }
  lines.push('')

  if (problems.length > 0) {
    lines.push('RESULT: FAIL（' + String(problems.length) + ' 项）')
  } else {
    lines.push('RESULT: PASS（A/B/D 全部计判项达标；C 逐条登记豁免；E 浅色岛口径成立；F 备用令牌在场）')
  }

  const report = lines.join('\n') + '\n'
  if (existsSync(OUT_DIR)) writeFileSync(OUT_FILE, report, 'utf8')

  console.log(report)
  if (problems.length > 0) {
    console.error('CONTRAST FAIL')
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  console.log('CONTRAST PASS（报表：' + OUT_FILE + '）')
}

/** 定宽填充（报表是给人读的表格，宽度对齐才扫得动）。 */
function pad(s: string, width: number): string {
  let out = s
  let len = 0
  for (const ch of s) len += ch.charCodeAt(0) > 0x2e80 ? 2 : 1
  while (len < width) { out += ' '; len++ }
  return out + ' '
}

main()
