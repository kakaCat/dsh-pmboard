/**
 * 提交判据（REQ-261006123819-3af3 FR-5）——C-28 的**可跑判据**。
 *
 * 用法：`npx tsx scripts/commit-check.mts --req <REQ-id>`（= `pnpm commit:check --req <REQ-id>`）
 * 口径：`git log --oneline --grep=<REQ-id>` 非空 ⇒ 打印 `OK` 并 exit 0；空 ⇒ 打印 `FAIL` 并 exit 1。
 *
 * 为什么需要这个脚本，而不是规范里直接写 `git commit`：
 * `validateOperationEntry`（`src/domain/knowledge/operations.ts`）要求操作条目的「命令」满足两条——
 * ① 以 `npx|pnpm|node|python3|tsx|bash` 起头；② 「期望」里含可对照锚点（OK / 退出码 / passed / NONE）。
 * 直接写 `git commit` 两条都不满足，K10 必红。本脚本把「提交与否」变成一个**可判定的读数**。
 *
 * 退出码约定：0 = 已提交；1 = 未提交（判据未过）；2 = 用法错（不是"没提交"，别混为一谈）。
 *
 * @module dsh-pmboard/scripts/commit-check
 */
import { execFileSync } from 'node:child_process'

const argv = process.argv.slice(2)

function argOf(flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

const req = argOf('--req')
if (req === undefined || !/^REQ-[0-9a-z-]+$/.test(req)) {
  console.error('用法：npx tsx scripts/commit-check.mts --req <REQ-id>（如 REQ-261006123819-3af3）')
  process.exit(2)
}

const log = execFileSync('git', ['log', '--oneline', '--grep=' + req], { encoding: 'utf8', cwd: process.cwd() }).trim()
if (log.length === 0) {
  console.error('FAIL：git log 里没有 ' + req + ' 的提交——改动还没提交（见 C-28：改动后必须提交）')
  process.exit(1)
}

const lines = log.split('\n')
console.log('OK：' + req + ' 有 ' + String(lines.length) + ' 条提交')
for (const l of lines.slice(0, 5)) console.log('  ' + l)
if (lines.length > 5) console.log('  …（仅显示前 5 条）')
process.exit(0)
