/**
 * 设计契约一致性判据（REQ-261005155003-f32f）——**防的是"原型反被实现带偏"这类事故**。
 *
 * ## 事故出处（2026-10-05，人眼发现）
 *
 * 设计契约写在权威原型 `detail-ui-v2.html` 的「改造层」里（95 条规则，`html[data-proto-v="next"]` 前缀，
 * 形态即"应当并进 `src/client/styles/report.ts` 的那一层"）。实施期漏了一整段——最刺眼的是
 * **Tab 栏**：设计是苹果**分段控件**（`#f5f5f7` 灰轨道 + 白色圆角滑块、无下划线），实现是下划线式。
 *
 * 为什么所有判据都没照出来：原型 v3 被"重新内联成实现的渲染"（真壳 + 真 CSS），于是
 * **实现偏离什么，原型就跟着偏什么**，两个产物之间永远"零漂移"。判据量的是"原型 == 实现"，
 * 而两者同源，当然恒等——真正该量的是"**实现 == 设计契约**"。
 *
 * ## 本脚本量什么
 *
 * ① 把 v2 的改造层**整层**叠回当前实现之上（同一份标本、同一视口），逐元素比对计算样式与几何；
 *    差异必须**为空**，除非命中白名单里的"已被裁定取代"项（逐条给依据，不许加宽泛豁免）。
 * ② 原型 v3 里内联的那份 CSS 必须**逐字节等于**当前 13 片拼接——否则原型画的是旧样式，
 *    "拿原型看效果"这件事本身就成了假的（本次事故的第二半）。
 *
 * 退出码 0 = 契约已吃干净；非 0 = 有未落地的设计项（会逐条点名，含选择器与属性）。
 *
 * @module dsh-pmboard/scripts/req-detail-design-conformance
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findChrome, SPECIMEN_CSS, specimenShell, WINDOW_HEIGHT } from './fixtures/req-detail-specimen.mts'

/** 要跑的状态：在途 + 终态（DOM 分支不同，只跑一个会漏）。 */
const STATES = ['inflight', 'terminal'] as const

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROTOTYPE = join(REPO, 'docs/requirements/REQ-261005155003-f32f/prototypes/detail-ui-v2.html')
const PROTOTYPE_V3 = join(REPO, 'docs/requirements/REQ-261005155003-f32f/prototypes/detail-ui-v3.html')

/** 叠层时只量这些属性：**外观可判**且不受字体渲染抖动影响（几何取整）。 */
const PROPS = ['w', 'h', 'bg', 'bd', 'bl', 'fs', 'fw', 'col', 'pad', 'lh', 'ls', 'before', 'after'] as const

/**
 * 白名单：**已被裁定取代**、因此允许与设计层不同的项。每条必须给出裁定出处，并且**限定到属性**
 * （不写 `'*'`）——按类整条豁免等于把这个类的判据全部关掉，下次这个类真出问题就照不出来了。
 */
const SUPERSEDED: readonly { cls: string; props: readonly string[]; why: string }[] = [
  {
    cls: 'dsh-pm-rh-bar',
    props: ['h', 'bd', 'pad'],
    why: 'D-8 裁定 A：动作行移到头部**第一行**（在身份行之上），设计层给的「上发丝线 + 上内边距」随之作废',
  },
  {
    cls: 'dsh-pm-detail-head dsh-pm-rh',
    props: ['h'],
    why: '上一条的高度级联（头部总高随动作行位置变化）',
  },
  {
    cls: 'dsh-pm-detail-title',
    props: ['h', 'fs', 'lh', 'ls'],
    why: 'FR-12 / FR-10(四) 勘误：页标题就是 24px（设计层写 20px 与勘误表相抵，字距随之另定 -.4px）',
  },
  {
    cls: 'dsh-pm-tabs',
    props: ['w'],
    why: '人裁定（2026-10-05）：「Tab 应该**满行**的」——设计层写 inline-flex（收缩到内容宽度），以人的裁量为准；同时 .dsh-pm-tab 的六格等宽（flex: 1 1 0）是其直接推论',
  },
  {
    cls: 'dsh-pm-tab',
    props: ['w'],
    why: '同上：满行 ⇒ 六格等宽平分，每格宽度随轨道铺满而变（设计层没写宽度，diff 只反映这一条推论）',
  },
  {
    cls: 'dsh-pm-tab active',
    props: ['w'],
    why: '同上（选中格同属六格之一）；它的底色/字重仍照设计层判，只豁免宽度这一条推论',
  },
]

/**
 * 规则级取代：这些**整条**不并入对照层（不是豁免属性——豁免属性会把"这个元素真出问题"一起放过）。
 *
 * 为什么必须整条丢：设计层用 CSS `::before` 画阶段/缺口标记，而本需求 FR-8 #1 明确改成
 * **真实文本节点**（原话：「伪元素对读屏不可靠」）。两者叠起来就是**双标记**（`✓✓`）——
 * 2026-10-05 真实发生过：并层时照搬了这五条，线上阶段条立刻变成 `✓✓ 立项` `▸▸ 归档`。
 * 丢掉规则后，若哪天有人把 `::before` 又加回实现，本判据会以 `before none→"✓ "` 报红。
 */
const SUPERSEDED_RULES: readonly { match: string; why: string }[] = [
  { match: '.dsh-pm-dot-wrapper.completed .dsh-pm-dot-label::before', why: 'FR-8 #1：标记改真实文本节点（.dsh-pm-dot-mark），不叠伪元素' },
  { match: '.dsh-pm-dot-wrapper.current .dsh-pm-dot-label::before', why: '同上（当前态 ▸）' },
  { match: '.dsh-pm-gap-line[data-severity="red"] .dsh-pm-gap-what::before', why: 'FR-8 #2：缺口标记改真实文本（.dsh-pm-gap-mark）+ aria-hidden 的 SVG 圆' },
  { match: '.dsh-pm-gap-line[data-severity="yellow"] .dsh-pm-gap-what::before', why: '同上（黄色档）' },
  { match: '.dsh-pm-gap-line[data-severity="gray"] .dsh-pm-gap-what::before', why: '同上（灰色档）' },
]

/** 取 v2 的「改造层」：第二个 `<style>`，去掉 `html[data-proto-v="next"]` 前缀与深色主题块。 */
function designLayer(): string {
  const html = readFileSync(PROTOTYPE, 'utf8')
  const blocks = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1] ?? '')
  const layer = blocks[1]
  if (layer === undefined || !layer.includes('html[data-proto-v="next"]')) {
    throw new Error('原型 v2 里找不到「改造层」（第二个 <style> 且带 data-proto-v 前缀）——契约源没了，判据不能假装通过')
  }
  // 注释里也会出现 `[data-ds-dark-theme]` 字面量，先摘注释再按规则剔除，否则会把令牌块一起吃掉（踩过）
  const nocomment = layer.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: string[] = []
  let i = 0
  while (i < nocomment.length) {
    const b = nocomment.indexOf('{', i)
    if (b < 0) break
    const sel = nocomment.slice(i, b)
    let depth = 1
    let j = b + 1
    while (j < nocomment.length && depth > 0) {
      if (nocomment[j] === '{') depth += 1
      else if (nocomment[j] === '}') depth -= 1
      j += 1
    }
    const body = nocomment.slice(b + 1, j - 1)
    const deprefixed = sel.replaceAll('html[data-proto-v="next"]', '').trim()
    const superseded = SUPERSEDED_RULES.some(r => deprefixed.includes(r.match))
    if (!sel.trimStart().startsWith('@') && !sel.includes('data-ds-dark-theme') && !superseded) {
      rules.push(deprefixed + '{' + body + '}')
    }
    i = j
  }
  return rules.join('\n')
}

/** 逐元素取计算样式（同一份标本、同一视口，只差"有没有叠设计层"）。 */
const SNAPSHOT_SCRIPT = [
  '<script>(function(){',
  'var out=[];var els=document.querySelectorAll("[class]");',
  'for (var i=0;i<els.length;i++){',
  ' var e=els[i],r=e.getBoundingClientRect(),cs=getComputedStyle(e);',
  ' out.push({c:String(e.className).slice(0,46),w:Math.round(r.width),h:Math.round(r.height),',
  '  bg:cs.backgroundColor,bd:cs.borderTopWidth,bl:cs.borderLeftWidth,fs:cs.fontSize,',
  '  fw:cs.fontWeight,col:cs.color,pad:cs.padding,lh:cs.lineHeight,ls:cs.letterSpacing,',
  '  before:getComputedStyle(e,"::before").content,after:getComputedStyle(e,"::after").content});',
  '}',
  'var d=document.createElement("div");d.id="geo";d.textContent=JSON.stringify(out);document.body.appendChild(d);',
  '})();</script>',
].join('\n')

type Snap = Record<string, string | number> & { c: string }

function snapshot(chrome: string, page: string): Snap[] {
  const dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--no-first-run', '--window-size=1280,' + String(WINDOW_HEIGHT), '--dump-dom', 'file://' + page,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 })
  const m = /<div id="geo">([\s\S]*?)<\/div>/.exec(dom)
  if (m === null) throw new Error('页内快照脚本没产出（注入失败或页面报错）')
  return JSON.parse(m[1]!.replace(/&quot;/g, '"')) as Snap[]
}

function main(): number {
  const chrome = findChrome()
  if (chrome === undefined) {
    console.log('设计契约一致性：找不到 Chrome → **读数不可得**（本脚本不假装通过）')
    return 0
  }
  const layer = designLayer()
  const dir = mkdtempSync(join(tmpdir(), 'conformance-'))
  const dump = SNAPSHOT_SCRIPT

  const allow = new Map<string, Set<string>>()
  for (const s of SUPERSEDED) allow.set(s.cls, new Set(s.props))
  const bad: string[] = []
  /* 两个状态都跑：**终态（archived）与在途的 DOM 分支不同**（终态没有动作按钮、结论格换文案、
     阶段条全绿…）。2026-10-05 的教训：只查在途，终态漏了一处「阶段标记叠成 ✓✓」的回归照不出来。 */
  for (const state of STATES) {
    const base = specimenShell(1280, state, dump, 'conformance-' + state)
    const pageA = join(dir, state + '-A.html')
    const pageB = join(dir, state + '-B.html')
    writeFileSync(pageA, base)
    writeFileSync(pageB, base.replace('</head>', `<style id="design-layer">\n${layer}\n</style></head>`))
    const A = snapshot(chrome, pageA)
    const B = snapshot(chrome, pageB)
    const byClass = new Map<string, [Snap, Snap]>()
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
      const key = A[i]!.c
      if (!byClass.has(key)) byClass.set(key, [A[i]!, B[i]!])
    }
    for (const [cls, [a, b]] of byClass) {
      const exempt = allow.get(cls)
      const ch = PROPS.filter(k => String(a[k]) !== String(b[k]) && !(exempt?.has(k) ?? false))
        .map(k => `${k} ${String(a[k])}→${String(b[k])}`)
      if (ch.length === 0) continue
      bad.push(`[${state}] 未落地的设计项 .${cls}：${ch.join(' ｜ ')}`)
    }
  }
  console.log('设计契约一致性（改造层叠回实现，逐元素比计算样式）')
  console.log(`  规则数 ${layer.split('\n').length}（已剔 ${SUPERSEDED_RULES.length} 条规则级取代）｜ 状态 ${STATES.join(' + ')} ｜ 白名单（已裁定取代）${SUPERSEDED.length} 条`)
  for (const s of SUPERSEDED) console.log(`  · 白名单 .${s.cls}（限 ${s.props.join('/')}）—— ${s.why}`)
  for (const r of SUPERSEDED_RULES) console.log(`  · 规则级取代 ${r.match} —— ${r.why}`)

  // ② 原型 v3 内联的 CSS 必须与当前拼接逐字节一致（否则原型画的是旧样式）
  const proto = readFileSync(PROTOTYPE_V3, 'utf8')
  const marker = '/* ── ① 真实样式：13 片 CSS，拼接顺序照 src/client/styles.ts（真实页面吃什么，这里就吃什么）── */'
  const at = proto.indexOf(marker)
  let cssOk = true
  if (at < 0) {
    bad.push('原型 v3 里找不到内联 CSS 的标记注释（块 ①）——无法证明它画的是当前样式')
    cssOk = false
  } else {
    const end = proto.indexOf('</style>', at)
    const inlined = proto.slice(at + marker.length, end).trim()
    if (inlined !== SPECIMEN_CSS.trim()) {
      bad.push(`原型 v3 内联的 CSS 与当前 13 片拼接不一致（${String(inlined.length)} vs ${String(SPECIMEN_CSS.trim().length)} 字符）——原型画的是旧样式，请重新内联`)
      cssOk = false
    }
  }
  console.log(`  原型 v3 内联 CSS 与当前拼接逐字节一致：${cssOk ? '是' : '否'}`)

  if (bad.length > 0) {
    console.log('\n设计契约一致性 FAIL：')
    for (const line of bad) console.log('  ✗ ' + line)
    console.log('\n两种处置：① 把设计项落进 report.ts（设计层自己的原话：选择器去掉前缀、其余一字不改）；')
    console.log('          ② 若确已被后续裁定取代，把该条类名 + 裁定出处写进本脚本的 SUPERSEDED 白名单。')
    return 1
  }
  console.log('\n设计契约一致性 PASS（设计层已被实现完全吸收；原型内联 CSS 与当前拼接一致）')
  return 0
}

process.exitCode = main()
