/**
 * 冷启动问答包与读入成本探针（REQ-261001110934-3766 t10）。
 *
 * 做两件事：
 *  ① 打印**固定 9 题**问答包（5 题冷启动 + 4 题架构），并给出「答案出处」——评分由人做（本脚本只准备材料）；
 *  ② 量两组读入成本：**只给知识层**（索引 + 代码地图）vs **不给知识层**（README + docs/architecture + 若干源码），
 *     用字符数对比，写进验收材料。
 *
 * 跑法：npx tsx scripts/kb-coldstart-probe.mts
 *
 * @module dsh-pmboard/scripts/kb-coldstart-probe
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { KB_PATHS, KB_PAGE_PATHS } from '../src/domain/knowledge/types.ts'

const ROOT = process.cwd()

const COLD_START = [
  ['这个项目分几层、依赖往哪边？', 'docs/knowledge/architecture.md#layers'],
  ['「人工门」有哪几道、由谁开？', 'src/application/gate/*（architecture.md#mechanisms 指向）'],
  ['加一个新的 Agent 工具，落点在哪？', 'docs/knowledge/architecture.md#extensions'],
  ['客户端为什么不能引裸 npm 包？', 'docs/knowledge/conventions.md#c-04'],
  ['归档索引由谁写、写在哪？', 'docs/knowledge/architecture.md#mechanisms（知识层）+ conventions.md#c-09'],
]

const ARCH = [
  ['四层边界分别叫什么？', 'docs/knowledge/architecture.md#layers'],
  ['依赖只许朝哪个方向？', 'docs/knowledge/architecture.md#layers'],
  ['样式归属契约写在哪儿？', 'docs/knowledge/conventions.md#c-05'],
  ['宿主单文件尺寸门禁限多少行？', 'docs/knowledge/conventions.md#c-02'],
]

function charsOf(paths: readonly string[]): number {
  let n = 0
  for (const p of paths) {
    const abs = join(ROOT, p)
    if (existsSync(abs)) n += readFileSync(abs, 'utf8').length
  }
  return n
}

/** 源码取样：按文件名排序取前 N 个（模拟"随便读几个文件"）。 */
function sampleSources(n: number): string[] {
  const dir = join(ROOT, 'src')
  const out: string[] = []
  const walk = (d: string): void => {
    if (out.length >= n) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (out.length >= n) return
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.ts')) out.push(p.slice(ROOT.length + 1))
    }
  }
  walk(dir)
  return out
}

const withKb = charsOf([KB_PATHS.index, KB_PAGE_PATHS['code-map']])
const archDocs = existsSync(join(ROOT, 'docs/architecture'))
  ? readdirSync(join(ROOT, 'docs/architecture')).filter((f) => f.endsWith('.md')).map((f) => 'docs/architecture/' + f)
  : []
const withoutKb = charsOf(['README.md', ...archDocs, ...sampleSources(8)])

console.log('# 冷启动问答包（评分由人做：答对 ≥4/5 为过；本轮只准备材料）\n')
console.log('## 冷启动 5 题')
COLD_START.forEach(([q, src], i) => console.log(`${String(i + 1)}. ${q}\n   ↳ 出处：${src}`))
console.log('\n## 架构 4 题')
ARCH.forEach(([q, src], i) => console.log(`${String(i + 1)}. ${q}\n   ↳ 出处：${src}`))

console.log('\n# 读入成本对比（字符数）\n')
console.log(`- 只给知识层（INDEX.md + code-map.md）：${String(withKb)} 字符`)
console.log(`- 不给知识层（README + docs/architecture/*.md + 8 个源码文件）：${String(withoutKb)} 字符`)
const ratio = withKb > 0 ? (withoutKb / withKb).toFixed(1) : 'n/a'
console.log(`- 倍数：约 ${ratio}×（前者是后者的 1/${ratio}）`)
console.log(`\n提示：完整答案可由 \`reqboard_kb(kind='architecture'|'standard')\` 按需取，单次返回 ≤ budgetChars。`)
