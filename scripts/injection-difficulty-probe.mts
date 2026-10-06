/**
 * 难度注入探针（REQ-261005154851-8512 FR-5 / design/test-cases.md §探针）。
 *
 * 【为什么需要它】单测断言的是"函数组合起来对不对"；这个探针把**同一段需求文本**在
 * 「带声明 expert」与「不带声明」两种输入下各跑一次取词，把两侧的 `routeKey` / 分片 id / 依据句
 * 并排打出来——人一眼就能看出"声明到底有没有算数"，以及"没声明时是否与改造前逐字相同"。
 *
 * 【判据】三项全成立才退出 0：
 *   ① 带声明 → 命中 `heavy` 系分片；
 *   ② 不带声明 → 分片 id 与**基线快照全等**（改造前行为，逐字不变）；
 *   ③ 带声明时 `difficultyReasons` 非空（说明"凭什么取这一档"留了痕）。
 *
 * 用法：`npx tsx scripts/injection-difficulty-probe.mts`
 * 退出码：0 = 全通过；1 = 有断言不成立（逐条点名，不静默跳过）。
 *
 * @module dsh-pmboard/scripts/injection-difficulty-probe
 */
import { difficultyFromDeclaredPrompt } from '../src/domain/prompt/difficulty-mapping.ts'
import { resolveStagePrompt } from '../src/domain/prompt/index.ts'

/** 标本：一段**推不出档位**的普通描述（推断 undefined → 默认 light）。 */
const SAMPLE = {
  title: '难度注入验收标本',
  description: '一段普通描述，不涉及架构、跨子系统或数据模型改动。',
}

/** 改造前的基线（无声明下的取词结果，逐字快照）。 */
const BASELINE_FRAGMENTS = [
  'brainstorming/light/feature',
  'brainstorming/light',
  'brainstorming/feature',
  'common/iron-rules',
]

/** 按注入缝的同款组合取词（映射 → 传 declaredDifficulty）。 */
function run(promptDifficulty: string | undefined): ReturnType<typeof resolveStagePrompt> {
  const declared = difficultyFromDeclaredPrompt(promptDifficulty)
  return resolveStagePrompt({
    stage: 'brainstorming',
    category: 'feature',
    requirement: SAMPLE,
    ...(declared === undefined ? {} : { declaredDifficulty: declared }),
  })
}

const failures: string[] = []
function check(ok: boolean, message: string): boolean {
  if (!ok) failures.push(message)
  return ok
}

const declared = run('expert')
const baseline = run(undefined)

console.log('[probe] REQ-261005154851-8512 难度声明接进取词')
console.log('  ── 带声明 expert ──────────────────────────────')
console.log(`  declared_route     = ${declared.routeKey}`)
console.log(`  declared_fragments = ${declared.fragmentIds.join(', ')}`)
console.log(`  reasons            = ${JSON.stringify(declared.difficultyReasons ?? [])}`)
console.log('  ── 不带声明（改造前行为） ────────────────────')
console.log(`  baseline_route     = ${baseline.routeKey}`)
console.log(`  baseline_fragments = ${baseline.fragmentIds.join(', ')}`)
console.log(`  reasons            = ${JSON.stringify(baseline.difficultyReasons ?? [])}`)
console.log('  映射读数           = ' + ['simple', 'standard', 'advanced', 'expert']
  .map(d => `${d}→${String(difficultyFromDeclaredPrompt(d))}`).join(' / '))

// ① 声明算数了：进重档
check(declared.routeKey.includes('heavy'), `带声明的 routeKey 未进重档：${declared.routeKey}`)
check(
  declared.fragmentIds.some(id => id.includes('heavy')),
  `带声明的分片里没有 heavy 系：${declared.fragmentIds.join(', ')}`,
)
// ② 无声明与改造前逐字相同（全等比较，不只看档位）
check(
  JSON.stringify(baseline.fragmentIds) === JSON.stringify(BASELINE_FRAGMENTS),
  `无声明的分片与基线快照不一致：${baseline.fragmentIds.join(', ')}`,
)
check(baseline.routeKey === 'brainstorming/light/feature', `无声明的 routeKey 变了：${baseline.routeKey}`)
// ③ 有声明就有依据句
check((declared.difficultyReasons ?? []).length > 0, '带声明时 difficultyReasons 为空（留痕缺依据）')
// 附：四档映射单调（简单档不得被提到重档）
check(difficultyFromDeclaredPrompt('simple') === 'light', 'simple 应映射为 light')
check(difficultyFromDeclaredPrompt('standard') === 'light', 'standard 应映射为 light')
check(difficultyFromDeclaredPrompt('advanced') === 'heavy', 'advanced 应映射为 heavy')
check(difficultyFromDeclaredPrompt('expert') === 'heavy', 'expert 应映射为 heavy')
check(difficultyFromDeclaredPrompt('') === undefined, '空串应按未声明处理（undefined）')

if (failures.length > 0) {
  console.error(`\n[probe] FAIL（${failures.length} 条）`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log('\n[probe] OK：声明算数（heavy）、无声明与基线逐字相同、依据句在场')
