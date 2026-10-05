/**
 * 归档清单对账演练（REQ-261004183621-de3f t7）——真实验收的可复核骨架。
 *
 * 五步（每步打印期望 vs 实际）：
 *   ① 漏列提交 → 期望**拒绝**（并列出未列文件）
 *   ② 声明豁免 → 期望通过（拿到三分类结果）
 *   ③ 归档后补录 3 条 → 期望追加
 *   ④ 同一批再补一次 → 期望全部 skipped（幂等）
 *   ⑤ 切到 warn 闸门重跑第 ① 步 → 期望**不拒**
 *
 * 装配说明：用与单测**同源**的最小装配（`tests/application/harness` + `tests/helpers/tool-deps`），
 * 避免为演练再写第二套夹具——生产装配在 `src/index.ts`，本脚本不复制它。
 *
 * 跑法：`npx tsx scripts/archive-reconcile-drill.mts`
 *
 * @module dsh-pmboard/scripts/archive-reconcile-drill
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from '../tests/application/harness.js'
import { stubDocFile, toUseCaseDeps } from '../tests/helpers/tool-deps.js'
import { submitArchive } from '../src/application/use-cases/SubmitArchive.js'
import { amendArchiveManifest } from '../src/application/use-cases/AmendArchiveManifest.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-drill'
const DIR = 'docs/requirements/REQ-abc123'
let failures = 0

function step(n: number, title: string): void {
  console.log('\n=== 步骤 ' + String(n) + ' · ' + title + ' ===')
}
function expect(label: string, ok: boolean, detail: string): void {
  console.log((ok ? '  ✅ ' : '  ❌ ') + label + ' —— ' + detail)
  if (!ok) failures += 1
}

const root = mkdtempSync(join(tmpdir(), 'pm-archive-drill-'))
const store = makeTestStore()

/** 造 fixture：3 份必列 + 1 份豁免 + 2 份未列。 */
for (const p of ['requirement.md', 'decomposition.md', 'verification.md', 'rtm-design.yml', 'queue.json', 'state/x.json', 'tasks/t-1.md', 'evidence/x.txt']) {
  stubDocFile(DIR + '/' + p, root)
}

const seed = async (gate: 'enforce' | 'warn' = 'enforce'): Promise<void> => {
  const r = {
    id: 'REQ-abc123', title: '演练需求', description: '', status: 'archived', blocked: false, category: 'feature',
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'archived', at: 1, by: { kind: 'human' } }],
  } as unknown as RequirementRecord
  await store.replaceAll('drill-seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  void gate
}

const deps = (gate?: 'enforce' | 'warn') =>
  toUseCaseDeps({ store, now: () => Date.now(), workspaceRoot: root, ...(gate !== undefined ? { archiveUnlistedGate: gate } : {}) } as never)

const exec = { agent: { id: W } }
const ARCHIVE = {
  dir: DIR,
  docs: [
    { kind: 'requirement', path: DIR + '/requirement.md' },
    { kind: 'plan', path: DIR + '/decomposition.md' },
    { kind: 'verification', path: DIR + '/verification.md' },
  ],
  merged_into: ['docs/architecture/project-manual.md'],
  index_entry: '演练：归档清单对账',
  manual_updates: [{ path: 'docs/architecture/project-manual.md', section: '收尾门', summary: '对账三分类与闸门' }],
} as const

console.log('归档清单对账演练（REQ-261004183621-de3f）')
console.log('临时工作区：' + root)

// ① 漏列 → 拒绝
step(1, '漏列提交（期望：拒绝）')
await seed()
let rejected = ''
try {
  await submitArchive(deps(), { ...ARCHIVE }, exec)
} catch (err) {
  rejected = (err as Error).message
}
expect('提交被拒', rejected.length > 0, rejected.length > 0 ? rejected.split('。')[0]! : '竟然通过了')
expect('未列文件被列出', rejected.includes('tasks/t-1.md') && rejected.includes('evidence/x.txt'), 'tasks/t-1.md、evidence/x.txt')
expect('给出两种处置方式', rejected.includes('docs 清单') && rejected.includes('unlisted_ack'), '收进清单 / 声明不收')

// ② 声明豁免 → 通过
step(2, '声明豁免后提交（期望：通过）')
let out2: Record<string, unknown> | undefined
try {
  out2 = await submitArchive(deps(), {
    ...ARCHIVE,
    unlisted_ack: [
      { path: DIR + '/tasks/t-1.md', reason: '任务卡由台账渲染，不入清单' },
      { path: DIR + '/evidence/x.txt', reason: '临时调试产物' },
    ],
  }, exec) as Record<string, unknown>
} catch (err) {
  console.log('  ❌ 竟然被拒：' + (err as Error).message)
  failures += 1
}
const rec2 = out2?.['reconcile'] as { listed?: unknown[]; exempted?: unknown[]; unlisted?: unknown[]; acknowledged?: unknown[]; gate?: string } | undefined
expect('提交通过', out2 !== undefined, out2 === undefined ? '未通过' : 'success')
expect('三分类计数', rec2?.listed?.length === 3 && rec2?.exempted?.length === 3 && rec2?.unlisted?.length === 2,
  '已列 ' + String(rec2?.listed?.length) + ' / 豁免 ' + String(rec2?.exempted?.length) + ' / 未列 ' + String(rec2?.unlisted?.length))
expect('闸门如实记录', rec2?.gate === 'enforce', 'gate=' + String(rec2?.gate))

// ③ 补录 3 条
step(3, '归档后补录 3 条（期望：追加）')
const amend = await amendArchiveManifest(deps(), {
  requirement_id: 'REQ-abc123',
  docs: [
    { kind: 'notes', path: DIR + '/tasks/t-1.md' },
    { kind: 'notes', path: DIR + '/evidence/x.txt' },
    { kind: 'notes', path: DIR + '/tests/test-evidence.md' },
  ],
  reason: '演练：归档后发现漏列',
}, exec)
expect('追加 3 条', amend.appended.length === 3, 'appended=' + String(amend.appended.length))
const rec3 = store.peekAll()[0]!
expect('清单变长且留痕', (rec3.archive?.docs.length ?? 0) === 6 && (rec3.archive?.amendments?.length ?? 0) === 1,
  'docs=' + String(rec3.archive?.docs.length) + ' amendments=' + String(rec3.archive?.amendments?.length))

// ④ 幂等
step(4, '同一批再补一次（期望：全 skipped）')
const before = (await store.head()).revision
const again = await amendArchiveManifest(deps(), {
  requirement_id: 'REQ-abc123',
  docs: [
    { kind: 'notes', path: DIR + '/tasks/t-1.md' },
    { kind: 'notes', path: DIR + '/evidence/x.txt' },
    { kind: 'notes', path: DIR + '/tests/test-evidence.md' },
  ],
  reason: '演练：重复补录',
}, exec)
expect('全部 skipped', again.appended.length === 0 && again.skipped.length === 3, 'skipped=' + String(again.skipped.length))
expect('未写盘（版本号不变）', (await store.head()).revision === before, 'revision=' + String(before))

// ⑤ warn 闸门 → 不拒
step(5, 'warn 闸门重跑第 ① 步（期望：不拒）')
await seed()
let passed = false
let gateSeen = ''
try {
  const out5 = await submitArchive(deps('warn'), { ...ARCHIVE }, exec) as { reconcile?: { gate?: string } }
  passed = true
  gateSeen = String(out5.reconcile?.gate)
} catch (err) {
  console.log('  ❌ 被拒：' + (err as Error).message)
}
expect('不拒（回到旧语义）', passed, passed ? 'success' : '被拒')
expect('闸门记为 warn', gateSeen === 'warn', 'gate=' + gateSeen)

rmSync(root, { recursive: true, force: true })
console.log('\n演练结论：' + (failures === 0 ? '五步全部符合期望 ✅' : '有 ' + String(failures) + ' 处不符合期望 ❌'))
process.exit(failures === 0 ? 0 : 1)
