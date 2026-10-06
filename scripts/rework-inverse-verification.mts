/**
 * 逆验证矩阵（REQ-261005122915-9f90 t7 / FR-1~FR-5）。
 *
 * ## 为什么要有这个脚本
 *
 * 「测试全绿」不足以证明测试测的是**修复**：把实现改回旧形态，如果测试依然绿，那它测的是空气。
 * 本脚本对四处修复各注入一次**旧实现**，要求对应的用例**变红**，再还原要求**变绿**——红/绿都留档。
 *
 * ## 用法
 *
 *   node --import tsx/esm scripts/rework-inverse-verification.mts
 *
 * 留档：`docs/requirements/REQ-261005122915-9f90/notes/inverse-verification.md`
 *
 * ⚠️ 只改 `src/`（宿主跑的是 `dist/` 产物，故运行中的看板不受影响）；每处都用 try/finally 还原，
 * 并在还原后按内容哈希复核（还原失败立刻抛，不留半改的仓库）。
 *
 * @module dsh-pmboard/scripts/rework-inverse-verification
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const REQ = 'REQ-261005122915-9f90'
const logPath = join(root, 'docs/requirements', REQ, 'notes/inverse-verification.md')

interface Patch {
  id: string
  /** 说明这处注入还原了什么（= 旧实现的形态） */
  reverts: string
  file: string
  from: string
  to: string
  /** 期望变红的用例文件 */
  test: string
}

const patches: Patch[] = [
  {
    id: 'A · FR-1 判据回退',
    reverts: '把落库幂等判据换回「未取消即真卡」——占位重做卡于是重新冒充已落库（现场缺陷本体）',
    file: 'src/application/internal/approved-plan-landing.ts',
    from: 'const liveReal = liveRealCards(await taskStoreOf(deps).listByRequirement(input.requirementId))',
    to: 'const liveReal = (await taskStoreOf(deps).listByRequirement(input.requirementId)).filter(t => t.status !== \'canceled\')',
    test: 'tests/approved-plan-landing-rework.test.ts',
  },
  {
    id: 'B · FR-2 收敛缺席',
    reverts: '去掉批准路径的回退态收敛调用——回到「只有手动拆分路径收敛」的三处漂移形态',
    file: 'src/application/internal/approved-plan-landing.ts',
    from: '  if (rollbackTo !== undefined) {\n    const collected = await cancelStaleReworkCards({',
    to: '  if (false) {\n    const collected = await cancelStaleReworkCards({',
    test: 'tests/approved-plan-landing-rework.test.ts',
  },
  {
    id: 'C · FR-4 占位卡复位',
    reverts: '让占位重做卡重新落进「子卡复位」分支（改回 todo）——第二轮回退也清不掉',
    file: 'src/application/internal/rollback-tasks.ts',
    from: '  const canceledPlaceholders = canceled.filter(c => (c.reworkOf ?? \'\') !== \'\')',
    to: '  const canceledPlaceholders: TaskRecord[] = []',
    test: 'tests/rollback-tasks.test.ts',
  },
  {
    id: 'D · FR-3 无条件推进',
    reverts: '看板批准路径回到「无论落没落库都推进到实施」',
    file: 'src/http/routers/requirements.ts',
    from: '          if (landingEffective) {',
    to: '          if (true) {',
    test: 'tests/reqboard/board-plan-approve.test.ts',
  },
]

function runVitest(testFile: string): { code: number; tail: string } {
  const res = spawnSync('npx', ['vitest', 'run', testFile, '--reporter', 'basic'], {
    cwd: root, encoding: 'utf8', timeout: 300_000,
  })
  const out = String(res.stdout ?? '') + String(res.stderr ?? '')
  return { code: res.status ?? -1, tail: out.trim().split('\n').slice(-6).join('\n') }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12)

const lines: string[] = [
  '# 逆验证留档（' + REQ + ' t7）',
  '',
  '> 由 `node --import tsx/esm scripts/rework-inverse-verification.mts` 生成。',
  '> 约定：**注入旧实现必须变红，还原后必须变绿**——两次都留档。',
  '',
  '| # | 注入的旧实现 | 用例文件 | 注入后 | 还原后 | 判定 |',
  '|---|---|---|---|---|---|',
]

let failed = 0
for (const p of patches) {
  const abs = join(root, p.file)
  const original = readFileSync(abs, 'utf8')
  const beforeHash = sha(original)
  if (!original.includes(p.from)) {
    lines.push(`| ${p.id} | ${p.reverts} | \`${p.test}\` | — | — | ❌ 注入点未命中（源码已变，脚本需同步） |`)
    failed += 1
    continue
  }
  let injected = ''
  let restored = ''
  try {
    writeFileSync(abs, original.replace(p.from, p.to), 'utf8')
    injected = runVitest(p.test).code === 0 ? '绿（❌ 不该绿）' : '红（✅ 如期）'
    if (injected.startsWith('绿')) failed += 1
  } finally {
    writeFileSync(abs, original, 'utf8')
  }
  const afterHash = sha(readFileSync(abs, 'utf8'))
  if (afterHash !== beforeHash) throw new Error(`还原失败：${p.file} 内容哈希不一致（${beforeHash} → ${afterHash}）`)
  const code = runVitest(p.test).code
  restored = code === 0 ? '绿（✅ 如期）' : '红（❌ 不该红）'
  if (code !== 0) failed += 1
  lines.push(`| ${p.id} | ${p.reverts} | \`${p.test}\` | ${injected} | ${restored} | ${injected.includes('✅') && restored.includes('✅') ? '✅ 通过' : '❌ 不通过'} |`)
  console.log(`[${p.id}] 注入=${injected} 还原=${restored}`)
}

lines.push('', failed === 0
  ? '**结论**：四处注入全部如期变红、还原后全部变绿 —— 用例确实钉在修复上（不是测空气）。'
  : `**结论**：有 ${failed} 项不符合预期，见上表。`, '')

writeFileSync(logPath, lines.join('\n'), 'utf8')
console.log(`留档：${logPath}`)
process.exit(failed === 0 ? 0 : 1)
