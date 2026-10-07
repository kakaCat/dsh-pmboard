// serves: FR-1, FR-2, FR-3, FR-4, FR-6
/**
 * 四通道对拍（REQ-261007135258-331a t5 · design/test-cases.md TC-6）。
 *
 * 判据（设计 use-cases.md「通道对拍矩阵」）：**同一台账初始态**下，四条通道各走一次，
 * 四元组 `{advanced, status, driverHealth.state, awaitingExit}` **逐项相等**。
 *
 * 为什么要对拍而不是各测各的：本需求的存在理由就是"通道各写一套 → 漏接不会被发现"。
 * 单通道用例会在自己那条路上照着实现写断言；对拍用例只认**一致面**，任一条通道漏了
 * 收尾（清停手位 / 复位健康），这里立刻红。
 *
 * 夹具形态（四条通道共用）：需求 `brainstorming` + `requirement` 产物已登记未落章 +
 * **停手位已写**（`driverHealth = paused / awaiting-confirm:pc-parity`）——正是 2026-10-07
 * 那次 2.5 小时静默停摆的台账形态。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { makeHarness, makeTestStore } from './application/harness.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { taskStoreAt } from './queue/route-deps.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { askConfirm } from '../src/application/use-cases/AskConfirm.js'
import { confirmArtifact } from '../src/application/use-cases/ConfirmArtifact.js'
import { createGatePromptPort } from '../src/application/dive/gate-prompt.js'
import { DEFAULT_CONFIRM_OPTIONS } from '../src/domain/text/labels.js'
import type { UseCaseDeps } from '../src/application/ports.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-parity-001'
const REQ = 'REQ-parity01'
const REQ_DIR = 'docs/requirements/' + REQ
const REQ_MD = REQ_DIR + '/requirement.md'

let dir: string
let store: ReturnType<typeof makeTestStore>

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pmboard-parity-')); store = makeTestStore() })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

/** 需求文档：判定门要求「讨论与裁定记录（D-x）」五要素齐、且「影响 FR」命中真实条款。 */
function writeReqDoc(): void {
  mkdirSync(join(dir, REQ_DIR), { recursive: true })
  writeFileSync(join(dir, REQ_MD), [
    '---', 'req: ' + REQ, 'sides: []', '---', '',
    '# 需求说明', '',
    '## 边界（不做）', '', '不做范围外的事。', '',
    '## 产品定义', '', '四通道接线收敛：确认一次 = 落章 + 推进 + 清停手位 + 复位健康。', '',
    '## 用户与角色', '',
    '| 角色 | 场景 | 痛点 |', '|---|---|---|', '| 人 | 点确认 | 状态不动 |', '',
    '## 功能点（需求条款）', '',
    '### FR-1: 确认即推进且四通道一致', '',
    '判据：`npx vitest run tests/confirm-channel-parity.test.ts` 全绿。', '',
    '## 失败与并发路径', '',
    '- 失败：门拦下 ⇒ 落章保留、推进不执行、回执带 gate_failure。',
    '- 并发：同一 (需求, 门) 重复确认 ⇒ 只迁移一次（乐观护栏）。',
    '- 非法迁移：canReqTransition 不过 ⇒ 不推进。', '',
    '## 讨论与裁定记录（D-x）', '',
    '| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |',
    '|---|---|---|---|---|',
    '| D-1 | 本窗口用户消息（2026-10-07 13:52）：「你梳理一下把线对齐了」 | 四通道统一走单点 | FR-1 | 对拍四元组逐项相等 |', '',
  ].join('\n'), 'utf8')
}

const openArtifact = (): StageArtifact => ({
  stage: 'brainstorming', kind: 'requirement', path: REQ_MD,
  registeredAt: 1, registeredBy: { kind: 'agent', sessionId: W },
}) as StageArtifact

/** 同一初始态：章未落 + 停手位已写（paused/awaiting-confirm:pc-parity）。 */
async function seed(): Promise<void> {
  const rec = {
    id: REQ, title: '四通道对拍', description: '', category: 'feature',
    status: 'brainstorming', blocked: false, sourceSessionId: W,
    comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    artifacts: [openArtifact()],
    dive: {
      phase: 'active', activation: 'armed', roundsInStage: 3,
      driverHealth: { state: 'paused', reason: 'awaiting-confirm:pc-parity', since: 1, attempts: 0 },
    },
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [rec], triages: [] })
}

/** 全量用例依赖：真盘文档仓储 + 内存台账 + 肯定作答的弹框通道。 */
function depsFor(): UseCaseDeps {
  const h = makeHarness()
  h.questions.availableFlag = true
  h.questions.answers = [{ id: 'confirm', selected: [DEFAULT_CONFIRM_OPTIONS[0]] }] as never
  return {
    ...h.deps,
    store: store as unknown as UseCaseDeps['store'],
    docs: new FileDocRepository({ workspaceRoot: dir }),
    questions: h.questions,
    session: h.session,
    clock: h.clock,
    ids: h.ids,
  } as UseCaseDeps
}

interface Fixture { deps: UseCaseDeps }
/** 通道定义：每条只负责"怎么发起这次确认"，一致面由下面的断言统一检查。 */
const CHANNELS: readonly { name: string; run: (f: Fixture) => Promise<void> }[] = [
  {
    name: 'prompt（会话弹框）',
    run: async (f) => {
      await askConfirm(f.deps, {
        requirement_id: REQ, target: 'artifact', kind: 'requirement', question: '需求文档已提交，确认进入设计？',
      }, { agent: { id: W } })
    },
  },
  {
    name: 'gate-prompt（Dive 门框）',
    run: async (f) => {
      await createGatePromptPort({ useCaseDeps: () => f.deps, deliver: () => { /* Dive 模式无投递 */ } }).prompt({
        gate: 'G1', kind: 'artifact', artifactKind: 'requirement',
        question: '门已满足：确认推进 brainstorming → design？', windowKey: W, requirementId: REQ,
      })
    },
  },
  {
    name: 'evidence（文字证据）',
    run: async (f) => {
      await confirmArtifact(f.deps, {
        requirement_id: REQ, target: 'artifact', kind: 'requirement', evidence: '用户说：确认进入设计',
      }, { agent: { id: W } })
    },
  },
  {
    name: 'board（看板一键）',
    run: async (f) => {
      const req = new EventEmitter() as never as { url: string; method: string; [k: symbol]: unknown }
      const r = req as unknown as Record<string, unknown>
      r['url'] = '/dashboard/api/reqboard/req/artifact/confirm'
      r['method'] = 'POST'
      ;(req as unknown as { [Symbol.asyncIterator]: unknown })[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ id: REQ, kind: 'requirement' }), 'utf8')
      }
      const res = new EventEmitter() as never as Record<string, unknown>
      res['statusCode'] = 0
      res['writeHead'] = (code: number) => { res['statusCode'] = code; return res }
      res['end'] = () => { return }
      const handler = createReqboardHandler({
        requirementStore: store as never,
        taskStore: taskStoreAt(dir),
        now: () => 1000,
        docs: f.deps.docs,
        applicationDeps: f.deps,
        agents: () => ({ get: () => ({ id: W, session: { fake: true } }) }),
      })
      await handler(req as never, res as never)
    },
  },
]

/** 一致面：本需求要锁死的四件事（回执形状刻意不要求一致）。 */
async function tupleOf(): Promise<{ advanced: boolean; status: string; health: string; awaitingExit: boolean }> {
  const rec = (await store.get(REQ))!
  const comments = (rec.comments ?? []).map((c) => c.body).join('\n')
  return {
    advanced: rec.status === 'design',
    status: rec.status,
    health: rec.dive?.driverHealth?.state ?? 'healthy',
    awaitingExit: comments.includes('c-awaiting-exit-') || comments.includes('[Dive 恢复] 等待结束'),
  }
}

describe('TC-6 四通道对拍：一致面逐项相等（FR-1、FR-2、FR-3、FR-4、FR-6）', () => {
  for (const ch of CHANNELS) {
    it(`${ch.name} ⇒ 推进到 design + 停手位清 + 健康位复位 + 章已落`, async () => {
      writeReqDoc()
      await seed()
      await ch.run({ deps: depsFor() })

      const rec = (await store.get(REQ))!
      expect(rec.status, ch.name + '：状态应推进到 design').toBe('design')
      expect(rec.dive?.driverHealth?.state, ch.name + '：健康位应复位').not.toBe('paused')
      expect(rec.dive?.driverHealth?.reason ?? '', ch.name + '：停手位原因不应再是 awaiting-confirm').not.toMatch(/^awaiting-confirm:/)
      expect(rec.artifacts?.[0]?.confirmedAt, ch.name + '：产物应已落章').toBeDefined()
      const comments = (rec.comments ?? []).map((c) => c.body).join('\n')
      expect(comments, ch.name + '：应留「自动推进」痕').toContain('[自动推进]')
      expect(comments, ch.name + '：应留「等待结束」痕').toContain('[Dive 恢复] 等待结束')
    })
  }

  it('四通道四元组逐项相等（本用例才是"对拍"本体）', async () => {
    const tuples: { name: string; t: Awaited<ReturnType<typeof tupleOf>> }[] = []
    for (const ch of CHANNELS) {
      writeReqDoc()
      await seed()
      await ch.run({ deps: depsFor() })
      tuples.push({ name: ch.name, t: await tupleOf() })
    }
    const base = tuples[0]!.t
    for (const { name, t } of tuples) expect(t, name + ' 与 ' + tuples[0]!.name + ' 不一致').toEqual(base)
  })
})
