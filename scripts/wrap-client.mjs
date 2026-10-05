// Wrap the compiled CJS client bundle into a browser module loader registration.
// Mirrors dsh-taskboard's scripts/wrap-client.mjs: reads package.json + the
// tsdown CJS output, emits lib/client.js as window.__ModuleLoader__.load({
//   id: pkg.name, factory: (require) => module.exports }) — the exact shape
// the DSH web shell's client-modules host serves at /plugins/??<pkg>/client.js.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const cjsBuf = readFileSync(join(root, 'lib', 'client.cjs'))
const cjs = cjsBuf.toString('utf8')

// REQ-261001124111-5d36 t4：客户端构建戳 = sha256(lib/client.cjs) 前 12 位。
// 与宿主侧 src/http/client-build.ts **必须同口径**（哈希对象都是 client.cjs 的原始字节，
// 不是本文件自己的输出——戳写在 client.js 体内，对自身内容取哈希是自指、写完即变）。
const stamp = createHash('sha256').update(cjsBuf).digest('hex').slice(0, 12)

// 2026-09-16 修复：不再给每行注入 \t\t 缩进——它会污染 bundle 内
// 多行模板字符串（marked 的 HTML 输出模板/缩进判断被注入 tab，
// 导致列表续行被误判为 code block、输出 HTML 带 \t\t）。
const body = cjs

const out = `window.__DSH_PM_BUILD__ = ${JSON.stringify(stamp)};
window.__ModuleLoader__.load({
\t\tid: ${JSON.stringify(pkg.name)},
\t\tfactory: (require) => {
\t\t\tvar module = { exports: {} };
\t\t\tvar exports = module.exports;
\t\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body}
\t\t\treturn module.exports;
\t\t}
\t});
\n`

writeFileSync(join(root, 'lib', 'client.js'), out)
console.log('wrapped', pkg.name, '->', 'lib/client.js', out.length, 'bytes')
