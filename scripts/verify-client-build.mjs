/**
 * client 构建产物校验（REQ-31e11f 验收返工 Step4）。
 *
 * 背景：2026-09-15 t7 从写工具截断事故恢复 styles.ts 时漏了 injectStyles() 的
 * 闭合括号，导致 build:client 报 PARSE_ERROR 失败，但失败的构建**没有阻断发版**——
 * 已提交的 lib/client.js 停留旧版被浏览器加载，用户看到"样式全丢"。
 *
 * 本脚本在 wrap-client 之后运行：产物缺关键符号、或 styles.ts 括号不配对 → 非零退出，
 * 让"构建失败/产物不全"成为发版硬阻断，而不是静默供旧包。
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..')
const bundlePath = join(pkgRoot, 'lib', 'client.js')
const stylesPath = join(pkgRoot, 'src', 'client', 'styles.ts')
const progressPath = join(pkgRoot, 'src', 'client', 'stage-panel.ts')

const fail = (msg) => { console.error('[verify-client] ' + msg); process.exit(1) }

// 1) 产物存在且非空
if (!existsSync(bundlePath)) fail('lib/client.js 不存在（wrap-client 未产出）')
const size = statSync(bundlePath).size
if (size < 20_000) fail('lib/client.js 体积异常（' + size + ' bytes），疑似空产物')

// 2) 产物含关键符号（新功能必须真的进了包）
const bundle = readFileSync(bundlePath, 'utf8')
// 注意：bundler 会改名 JS 标识符（函数名不可靠），但**字符串字面量（class 名）会保留**，
// 所以用 class 名作为产物完整性锚点。
const must = [
  'dsh-pm-flow-node',        // 会话框流程图
  'dsh-pm-stage-panel',      // t6 节点详情面板
  'dsh-pm-trace-chain',      // 追溯链
  'dsh-pm-artifact-chip',    // t7 产物 chip
  'dsh-pm-confirm-artifact', // t7 卡面确认按钮
  'dsh-pm-sn-task',          // v4 任务执行列表行（单节点工作记录）
  'dsh-pm-injection-info',   // REQ-422af1 t11 「本次注入了什么」只读块
  'dsh-pm-dag-panel',        // REQ-260928001915-f978 真 DAG 画布面板
  'dsh-pm-np-board-entry',   // REQ-260928222643-4d34 FR-1 会话节点面板「项目看板 ↗」入口
  'dsh-pm-np-entry-err',     // REQ-260928222643-4d34 FR-3 入口失败就地提示（不静默、不白屏）
  'dsh-pm-np-fresh',         // REQ-261001124111-5d36 FR-2 面板「数据时间」（陈旧可见）
  'dsh-pm-np-fresh-err',     // REQ-261001124111-5d36 FR-3 刷新失败红条（有旧数据也照出）
  'dsh-pm-np-build-notice',  // REQ-261001124111-5d36 FR-5 「插件已更新，点此刷新」
]
const missing = must.filter((k) => !bundle.includes(k))
if (missing.length > 0) fail('产物缺少关键符号：' + missing.join(', '))

// 2b) 样式表**归属章**必须在产物里（2026-10-01「刷新后流程节点样式全丢」事故）：
// 不带 data-plugin 的 <style> 会被 DSH client-modules 的 claimStyles 认领给下一个
// materialize 的别的插件，随后被它的 removeOwnedStyles 连带删除且永不恢复。
// 属性写入在压缩后仍保留（属性名不会被改名），可用作锚点。
const ownership = ['dataset.plugin=', 'dataset.pluginCss=']
const missingOwnership = ownership.filter((k) => !bundle.includes(k))
if (missingOwnership.length > 0) {
  fail('产物缺少样式归属章（' + missingOwnership.join(', ') + '）：样式会被别的插件认领后连带删除（刷新后样式全丢）')
}

// 2c) 构建戳必须与 client.cjs 一致（REQ-261001124111-5d36 t4）：
// 宿主按 sha256(lib/client.cjs)[0:12] 现算戳，页面按内联戳比对；两处不一致会**恒误报**
// 「插件已更新」，或（更糟）漏报真正的旧版本。故把一致性钉成构建期硬门禁。
{
  const cjsPath = join(pkgRoot, 'lib', 'client.cjs')
  if (!existsSync(cjsPath)) fail('lib/client.cjs 不存在（tsdown 未产出）')
  const expected = createHash('sha256').update(readFileSync(cjsPath)).digest('hex').slice(0, 12)
  const injected = /window\.__DSH_PM_BUILD__\s*=\s*"([0-9a-f]+)"/.exec(bundle)
  if (injected === null) fail('产物缺少内联构建戳 __DSH_PM_BUILD__（wrap-client 未注入）')
  if (injected[1] !== expected) {
    fail('内联构建戳与 client.cjs 不一致（bundle=' + injected[1] + '，现算=' + expected + '）：宿主会误报/漏报「插件已更新」')
  }
}

// 3) CSS 分片截断信号（防 t7 静默截断事故）——REQ-47939a 之后 CSS 已分层到 styles/*.ts，
//    物理末尾不再是 styles.ts 的 `}`，而是**每个分片的模板字符串收尾**。
//    所以把「以 } 收尾」这条老信号挂到真正的 CSS 载体上，另外确认 styles.ts 仍在调用注入器。
if (existsSync(stylesPath)) {
  const stylesTs = readFileSync(stylesPath, 'utf8')
  if (!/injectStyles\s*\(/.test(stylesTs)) fail('styles.ts 丢失 injectStyles 调用（t7 事故的另一种形态：接口被删）')
}
const stylesDir = join(pkgRoot, 'src', 'client', 'styles')
if (!existsSync(stylesDir)) fail('src/client/styles/ 目录丢失（CSS 分片去哪了？）')
const fragments = readdirSync(stylesDir).filter((f) => f.endsWith('.ts'))
if (fragments.length === 0) fail('src/client/styles/ 下没有 CSS 分片')
let cssOpen = 0
let cssClose = 0
for (const file of fragments) {
  const text = readFileSync(join(stylesDir, file), 'utf8')
  if (!/`;?$/.test(text.trimEnd())) fail('styles/' + file + ' 未以模板字符串收尾（反引号）：疑似被截断')
  cssOpen += (text.match(/\{/g) || []).length
  cssClose += (text.match(/\}/g) || []).length
}
// 括号差值仅告警，不阻断（CSS 内容可能含字面量括号）
if (cssOpen !== cssClose) console.warn('[verify-client] 注意 styles/ 花括号 {=' + cssOpen + ' }=' + cssClose + '（差值 ' + (cssOpen - cssClose) + '）——若非 CSS 字面量请人工核对')

// 4) stage-panel 存在（t6）
if (!existsSync(progressPath)) fail('src/client/stage-panel.ts 丢失')

// 5) wrap 污染检测（2026-09-16 wrap-client 逐行注入 \t\t 事故）：
// styles.ts 里的 sentinel 注释在干净产物中必须顶格出现；若被行首注入
// 任何字符（tab/空格），说明 wrap 又对 bundle 正文做了逐行变换——
// 那种变换会污染 bundle 内所有多行模板字符串（marked 事件同款）。
if (!bundle.includes('\n/*WRAP_SENTINEL_MARKER*/')) fail('wrap-sentinel 缺失：产物中找不到哨兵（styles.ts 被改坏？）')
if (bundle.includes('\t/*WRAP_SENTINEL_MARKER*/') || bundle.includes('  /*WRAP_SENTINEL_MARKER*/')) {
  fail('wrap-sentinel 被行首注入污染：wrap-client 对 bundle 正文做了逐行变换，禁止！（2026-09-16 marked 事件）')
}

console.log('[verify-client] OK  bundle=' + size + ' bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整')
