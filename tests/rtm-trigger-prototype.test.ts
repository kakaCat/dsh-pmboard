/**
 * `submit:prototype` 触发点回归（REQ-261005105032-3b02 t9 · FR-5 / FR-9 / 决议 #48）。
 *
 * 标本 = 临时工作区里的一个 UI 需求（`requirement.md` 的 FR-1 + 一份权威原型 + INDEX）；
 * 依赖用**最小替身**（只给 `docs.workspaceRoot` 与台账摘要页/单条读），RTM 的写盘是**真写盘**
 * （vendor 生成器 + 真 fs）——断言的是盘上 YAML 的实际内容，不是 mock 的调用次数。
 *
 * 覆盖的验收锚点（逐条对应 t9 卡面）：
 *   ① 调同步入口（`submit:prototype`）后 `rtm-brainstorming.yml` 被刷新、返回 `ok`、`paths` 在留痕中可见；
 *   ② 生成器仍以**台账**为事实源：载荷里多出来的路径（ghost）不进 YAML；
 *   ③ RTM 写盘失败只记 warning 并结构化返回（`ok:false` + `error`），**不抛**；
 *   ④ 回归锁：既有触发点仍原样交给 vendor 分派（新增分支没把别的触发点改道）。
 *
 * @module dsh-pmboard/tests/rtm-trigger-prototype
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { syncRTMYaml } from '../src/application/internal/rtm-yaml.js'
import { readRTMTriggerTraces } from '../src/application/internal/rtm-health.js'
import type { UseCaseDeps } from '../src/application/ports.js'
import type { ActorRef, RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const REQ_ID = 'REQ-261005105032-t9'
const HUMAN: ActorRef = { kind: 'human' }

/** requirement.md 标本：一条 FR 明细 + 空裁定节（本用例只关心 RTM 刷新，不触裁定门）。 */
const REQ_MD = [
  '# 需求说明',
  '',
  '**FR-1: 原型进追溯链**',
  '',
  '## 讨论与裁定记录（D-x）',
  '',
  '本节无裁定',
  '',
].join('\n')

/** 权威原型：一个 FR 锚点 + 单块 proto-geometry。 */
const DETAIL_HTML = [
  '<!doctype html>',
  '<html><body>',
  '<section id="FR-1">标题区</section>',
  '<!-- proto-geometry {"observations":[{"name":"tabsTop","value":12,"unit":"px",',
  '"at":{"width":1280,"state":"terminal"}}]} -->',
  '</body></html>',
  '',
].join('\n')

/** 权威清单（决议 #1：INDEX 自身也是 kind=prototype 产物，但不是一份原型页面）。 */
const INDEX_MD = [
  '# 原型权威清单',
  '',
  '| 路径 | 状态 | 服务条款 | 被取代于 |',
  '|---|---|---|---|',
  '| prototypes/detail.html | authoritative | FR-1 | — |',
  '',
].join('\n')

/** 最小需求记录：台账产物里含 `kind=prototype`（生成器的事实源）。 */
function makeReq(): RequirementRecord {
  const artifacts: StageArtifact[] = [
    { stage: 'brainstorming', kind: 'requirement', path: 'requirement.md', registeredAt: 1, registeredBy: HUMAN },
    { stage: 'brainstorming', kind: 'prototype', path: 'prototypes/detail.html', registeredAt: 2, registeredBy: HUMAN },
    { stage: 'brainstorming', kind: 'prototype', path: 'prototypes/INDEX.md', registeredAt: 3, registeredBy: HUMAN },
  ]
  return {
    id: REQ_ID,
    title: 't9 触发点标本（登记原型 → 刷新 RTM）',
    description: '标本',
    category: 'feature',
    status: 'brainstorming',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    createdBy: HUMAN,
    updatedBy: HUMAN,
    statusHistory: [],
    artifacts,
  }
}

/**
 * 最小依赖：`syncRTMYaml` 只用 `deps.docs.workspaceRoot()` 与需求存储的
 * `listSummaries`（快照）/ `get`（写盘根核验）。其余端口在 RTM 链路上不被触碰。
 */
function makeDeps(root: string, req: RequirementRecord): UseCaseDeps {
  const store = {
    listSummaries: async () => ({ items: [req] }),
    get: async (id: string) => (id === req.id ? req : undefined),
  }
  return { docs: { workspaceRoot: () => root }, store } as unknown as UseCaseDeps
}

/** 落盘标本（真文件：生成器要读 requirement.md / 原型 HTML / INDEX）。 */
function seedWorkspace(root: string): string {
  const reqDir = join(root, 'docs', 'requirements', REQ_ID)
  mkdirSync(join(reqDir, 'prototypes'), { recursive: true })
  mkdirSync(join(reqDir, 'design'), { recursive: true })
  writeFileSync(join(reqDir, 'requirement.md'), REQ_MD)
  writeFileSync(join(reqDir, 'prototypes', 'detail.html'), DETAIL_HTML)
  writeFileSync(join(reqDir, 'prototypes', 'INDEX.md'), INDEX_MD)
  writeFileSync(join(reqDir, 'design', 'backend.md'), '# 后端设计\n\n## 1. 触发点 serves: FR-1\n')
  return reqDir
}

interface BrainstormingYaml {
  metadata?: { rtm_version?: string }
  outputs?: {
    requirements?: unknown[]
    prototypes?: { path: string; authoritative?: boolean; serves?: string[] }[]
  }
}

describe('submit:prototype 触发点（t9）', () => {
  let root: string
  let reqDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rtm-trigger-proto-'))
    reqDir = seedWorkspace(root)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  it('① 刷新 rtm-brainstorming.yml（返回 ok / files），paths 在留痕中可见', async () => {
    const req = makeReq()
    const payloadPaths = ['prototypes/detail.html', 'prototypes/ghost.html']

    const result = await syncRTMYaml(makeDeps(root, req), [], REQ_ID, 'submit:prototype', { paths: payloadPaths })

    // 返回体：结构化、与既有触发点同形
    expect(result?.ok).toBe(true)
    expect(result?.trigger).toBe('submit:prototype')
    expect(result?.requirement_id).toBe(REQ_ID)
    expect(result?.files).toEqual(['rtm-brainstorming.yml', 'rtm-lifecycle.yml'])

    // 盘上确实被刷新（真生成器真写盘）
    const ymlPath = join(reqDir, 'rtm-brainstorming.yml')
    expect(existsSync(ymlPath)).toBe(true)
    expect(existsSync(join(reqDir, 'rtm-lifecycle.yml'))).toBe(true)
    const doc = parseYaml(readFileSync(ymlPath, 'utf-8')) as BrainstormingYaml
    expect(doc.outputs?.requirements).toHaveLength(1) // FR-1 来自 requirement.md
    expect(doc.outputs?.prototypes?.map(p => p.path)).toEqual(['prototypes/detail.html'])
    expect(doc.outputs?.prototypes?.[0]?.authoritative).toBe(true) // 权威角色取自 INDEX
    expect(doc.outputs?.prototypes?.[0]?.serves).toEqual(['FR-1'])

    // 留痕：本次携带的 paths 原样可见（决议 #48 的"留痕"那一半）
    const traces = readRTMTriggerTraces(join(root, '.dsh-data', 'state'))
    expect(traces).toHaveLength(1)
    expect(traces[0]?.requirement_id).toBe(REQ_ID)
    expect(traces[0]?.trigger).toBe('submit:prototype')
    expect(traces[0]?.paths).toEqual(payloadPaths)
  })

  it('② 台账仍是事实源：载荷里多出来的路径不进 YAML', async () => {
    const req = makeReq()

    await syncRTMYaml(makeDeps(root, req), [], REQ_ID, 'submit:prototype', {
      paths: ['prototypes/detail.html', 'prototypes/ghost.html'],
    })

    const text = readFileSync(join(reqDir, 'rtm-brainstorming.yml'), 'utf-8')
    expect(text).toContain('prototypes/detail.html')
    // 台账里没登记的路径，载荷再怎么写也不许出现在 RTM（#48：载荷不当唯一来源）
    expect(text).not.toContain('ghost')
  })

  it('③ 写盘失败：只记 warning + 结构化返回，不抛', async () => {
    const req = makeReq()
    // 让写盘必失败：把目标文件名占成一个**目录**（读得到、写不进 rename 不过）
    rmSync(join(reqDir, 'rtm-brainstorming.yml'), { recursive: true, force: true })
    mkdirSync(join(reqDir, 'rtm-brainstorming.yml'))
    // 失败记录要能落盘（否则 recordRTMFailure 自己也会失败，断言不到点名的触发点）
    mkdirSync(join(root, '.dsh-data', 'state'), { recursive: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await syncRTMYaml(makeDeps(root, req), [], REQ_ID, 'submit:prototype', {
      paths: ['prototypes/detail.html'],
    })

    // 不抛：结构化返回失败（增强层纪律，FR-9）
    expect(result).toBeDefined()
    expect(result?.ok).toBe(false)
    expect(result?.error ?? '').toContain('写入失败')
    // 只记 warning（且点到了本次触发点）
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls.flat().join(' ')).toContain('submit:prototype')

    // 失败留痕：触发点名如实记下新触发点（联合类型已收编进 vendor，见 ⑤）
    const failures = JSON.parse(readFileSync(join(root, '.dsh-data', 'state', 'rtm-failures.json'), 'utf-8'))
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({ requirement_id: REQ_ID, trigger: 'submit:prototype' })
  })

  it('④ 回归锁：既有触发点仍走 vendor 分派（新增分支没改道别的触发点）', async () => {
    const req = makeReq()

    const result = await syncRTMYaml(makeDeps(root, req), [], REQ_ID, 'confirm:artifact')

    expect(result?.ok).toBe(true)
    expect(result?.files).toEqual(['rtm-brainstorming.yml', 'rtm-design.yml', 'rtm-lifecycle.yml'])
    expect(existsSync(join(reqDir, 'rtm-design.yml'))).toBe(true)
  })

  it('⑤ 单一真相锁：触发点集合只在 vendor 一处（宿主不得再自建联合类型/分派）', () => {
    // 为什么锁源码而不是行为：两处触发点集合**行为一致时也照样是两份真相**——漂移只会在
    // 未来某次只改一处时暴露（那正是本需求要消灭的形态）。故这里机械检查"没有第二份"。
    const hostSrc = readFileSync(new URL('../src/application/internal/rtm-yaml.ts', import.meta.url), 'utf-8')
    expect(hostSrc).not.toContain('runSubmitPrototypeTrigger')
    expect(hostSrc).not.toMatch(/RTMTrigger\s*\|\s*'submit:prototype'/)
    expect(hostSrc).toMatch(/runRTMTrigger\(generator, trigger, reqId, payload\)/)

    // 收编确实落在 vendor：联合类型 + 分派表（filesForTrigger）都要认它
    const vendorSrc = readFileSync(new URL('../vendor/reqboard/src/rtm/generator.ts', import.meta.url), 'utf-8')
    expect(vendorSrc).toMatch(/\|\s*'submit:prototype'/)
    expect(vendorSrc).toContain("case 'submit:prototype'")
  })
})
