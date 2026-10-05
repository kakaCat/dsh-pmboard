/**
 * L2 单测 · 分片目录仓储（REQ-261002161439-277d · t3 / FR-2、FR-3、FR-4）。
 *
 * 卡上验收五条逐条落地：
 * ① 原子写失败（注入 rename 抛错）不留半截目标文件、**临时文件被清理**；
 * ② 解析失败改名 `.corrupt-<ts>` 且**其他需求分片不受影响**；
 * ③ `appendJournal` 在「日志比计数多一行」时**先截断再追加**；
 * ④ 结构校验失败时**一个字节都不落盘**（目录都不许建）；
 * ⑤ `listHotIds` 只返回**目录**，忽略文件与测试残留。
 *
 * 用假 fs（不落真实磁盘）：用例测试不落盘是本仓 harness 的既有口径，
 * 而且失败路径（rename 抛错、open 失败）用真实文件系统很难稳定复现。
 */
import { describe, it, expect } from 'vitest'
import {
  RequirementShardRepository,
} from '../../src/repositories/RequirementShardRepository.js'
import { REQUIREMENT_STORE_ERROR } from '../../src/application/ports.js'
// 共享假 fs（t4 起抽出）：此前本文件自带一份，两份必然漂移——本卡实测它缺了新增的 rm 方法。
import { FakeShardFs } from './fake-shard-fs.js'
import { JOURNAL_ERROR, toCommentLine, encodeJournalLine, type JournalLine } from '../../src/domain/requirement/Journal.js'
import { journalPath, recordPath } from '../../src/domain/requirement/ReqboardPaths.js'
import type { RequirementRecord } from '../../src/shared/protocol.js'

const ROOT = '/data/reqboard'
const REQ = 'REQ-261002161439-277d'
const OTHER = 'REQ-261002120707-deab'
const NOW = 1_700_000_000_000

function makeRepo(fs = new FakeShardFs()): { repo: RequirementShardRepository; fs: FakeShardFs; warns: string[] } {
  const warns: string[] = []
  const repo = new RequirementShardRepository({ fs, now: () => NOW, onWarn: (m) => warns.push(m) })
  return { repo, fs, warns }
}

function record(id: string, over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id,
    title: `需求 ${id}`,
    description: '描述',
    status: 'implementing',
    blocked: false,
    comments: [],
    version: 3,
    createdAt: 1,
    updatedAt: 2,
    createdBy: { kind: 'agent' },
    updatedBy: { kind: 'agent' },
    ...over,
  }
}

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p
    return undefined
  } catch (err) {
    return (err as { code?: string }).code
  }
}

// ---------------------------------------------------------------------------
// 验收 ① 原子写
// ---------------------------------------------------------------------------

describe('原子写（验收 ①）', () => {
  it('正常写入：目标就位、可解析、无 .tmp 残留', async () => {
    const { repo, fs } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ))
    expect(JSON.parse(fs.files.get(recordPath(ROOT, REQ))!)).toMatchObject({ id: REQ, version: 3 })
    expect(fs.tempLeftovers()).toEqual([])
  })

  it('rename 抛错 → 目标不被污染，且**临时文件被清理**（t3 起的行为，原实现会残留 .tmp）', async () => {
    const { repo, fs, warns } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ, { title: '旧内容' }))
    const before = fs.files.get(recordPath(ROOT, REQ))!
    fs.faults.rename = true
    await expect(repo.writeRecordAtomic(ROOT, REQ, record(REQ, { title: '新内容' }))).rejects.toThrow()
    expect(fs.files.get(recordPath(ROOT, REQ))).toBe(before) // 半截都没有
    expect(fs.tempLeftovers()).toEqual([]) // 不留泄漏
    expect(warns).toEqual([]) // 清理成功不该告警
  })

  it('open 抛错（磁盘满/权限）→ 同样不留 .tmp，错误照原样抛', async () => {
    const { repo, fs } = makeRepo()
    fs.faults.open = true
    await expect(repo.writeRecordAtomic(ROOT, REQ, record(REQ))).rejects.toThrow(/open 失败/)
    expect(fs.tempLeftovers()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 验收 ④ 校验先于任何写
// ---------------------------------------------------------------------------

describe('校验先于任何写（验收 ④）', () => {
  it('id 与目标目录不一致 / 标题空 / id 非法 → VALIDATION_FAILED，**目录都不建**', async () => {
    const { repo, fs } = makeRepo()
    const dirCountBefore = fs.dirs.size

    expect(await codeOf(repo.writeRecordAtomic(ROOT, REQ, record(OTHER)))).toBe(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED)
    expect(await codeOf(repo.writeRecordAtomic(ROOT, REQ, record(REQ, { title: '   ' })))).toBe(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED)
    expect(await codeOf(repo.writeRecordAtomic(ROOT, '../escape', record('../escape')))).toBe(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED)

    expect(fs.dirs.size).toBe(dirCountBefore) // 一个目录都没多
    expect(fs.files.size).toBe(0) // 一个字节都没写
  })

  it('校验失败的记录**不隔离**（那是内容不合规，不是文件损坏——改名会毁掉还能手工修的数据）', async () => {
    const { repo, fs } = makeRepo()
    const bad = record(REQ, { id: OTHER }) // id 与目录名不符
    await repo.writeRecordAtomic(ROOT, OTHER, bad) // 写到 OTHER 目录就合法了
    const file = recordPath(ROOT, OTHER)
    expect(fs.files.has(file)).toBe(true)
    // 现在用 REQ 目录读同一份文件 → 结构不合规
    fs.files.set(recordPath(ROOT, REQ), fs.files.get(file)!)
    expect(await codeOf(repo.readRecord(ROOT, REQ))).toBe(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED)
    expect(fs.files.has(recordPath(ROOT, REQ))).toBe(true) // 没被改名隔离
  })
})

// ---------------------------------------------------------------------------
// 验收 ② 坏文件隔离
// ---------------------------------------------------------------------------

describe('坏文件隔离（验收 ②）', () => {
  it('热记录解析失败 → 改名 .corrupt-<ts> + 告警 + 返回 undefined', async () => {
    const { repo, fs, warns } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ))
    fs.files.set(recordPath(ROOT, REQ), '{ 这不是 JSON')
    expect(await repo.readRecord(ROOT, REQ)).toBeUndefined()
    expect(fs.files.has(recordPath(ROOT, REQ))).toBe(false)
    expect(fs.files.has(`${recordPath(ROOT, REQ)}.corrupt-${NOW}`)).toBe(true)
    expect(warns.some((w) => w.includes('隔离'))).toBe(true)
  })

  it('隔离一个坏需求**不影响其他需求**（各需求一个目录，互不牵连）', async () => {
    const { repo, fs } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ))
    await repo.writeRecordAtomic(ROOT, OTHER, record(OTHER))
    fs.files.set(recordPath(ROOT, REQ), 'garbage')
    expect(await repo.readRecord(ROOT, REQ)).toBeUndefined()
    expect((await repo.readRecord(ROOT, OTHER))?.id).toBe(OTHER) // 邻居照常可读
    expect(await repo.listHotIds(ROOT)).toEqual([OTHER, REQ].sort()) // 目录都还在（只有文件被改名）
  })

  it('外置对象不可序列化（undefined/函数）→ VALIDATION_FAILED，不写出垃圾（复核新增防线）', async () => {
    const { repo, fs } = makeRepo()
    expect(await codeOf(repo.writeObjectAtomic(ROOT, REQ, 'plan', undefined))).toBe(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED)
    expect(await codeOf(repo.writeObjectAtomic(ROOT, REQ, 'plan', () => 1))).toBe(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED)
    expect(fs.files.size).toBe(0) // 一个字节都没写
    expect(fs.tempLeftovers()).toEqual([])
  })

  it('外置对象解析失败同样隔离；不存在 → undefined（不是错误）', async () => {
    const { repo, fs } = makeRepo()
    expect(await repo.readObject(ROOT, REQ, 'plan')).toBeUndefined()
    await repo.writeObjectAtomic(ROOT, REQ, 'plan', { path: 'p', tasks: [] })
    fs.files.set(recordPath(ROOT, REQ).replace('record.json', 'plan.json'), 'broken')
    expect(await repo.readObject(ROOT, REQ, 'plan')).toBeUndefined()
    const planFile = [...fs.files.keys()].find((p) => p.includes('plan.json'))
    expect(planFile?.includes('.corrupt-')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 验收 ③ 追加日志：按计数截断
// ---------------------------------------------------------------------------

describe('追加日志（验收 ③）', () => {
  const line = (seq: number, id: string): JournalLine => toCommentLine(seq, { id, body: `${id} 正文`, createdAt: seq })

  it('空日志 → 写入 seq 0；连续追加按 seq 递增', async () => {
    const { repo, fs } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ))
    await repo.appendJournal(ROOT, REQ, 'comments', line(0, 'c-0'), 0)
    await repo.appendJournal(ROOT, REQ, 'comments', line(1, 'c-1'), 1)
    const text = fs.files.get(journalPath(ROOT, REQ, 'comments'))!
    expect(text.split('\n').filter(Boolean)).toHaveLength(2)
    expect((await repo.readJournal(ROOT, REQ, 'comments')).lines.map((l) => l.seq)).toEqual([0, 1])
  })

  it('**日志比计数多一行**（崩溃残留）→ 先截断未提交尾巴，再写同一 seq', async () => {
    const { repo, fs } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ))
    // 预置：已提交 2 行（seq 0/1）+ 一行未提交残留（seq 2）
    fs.files.set(journalPath(ROOT, REQ, 'comments'), [line(0, 'c-0'), line(1, 'c-1'), line(2, 'c-残留')].map(encodeJournalLine).join(''))
    // 提交点计数 = 2 → 追加时先截断，再写 seq 2（覆盖那一行残留）
    await repo.appendJournal(ROOT, REQ, 'comments', line(2, 'c-新'), 2)
    const { lines } = await repo.readJournal(ROOT, REQ, 'comments')
    expect(lines.map((l) => l.seq)).toEqual([0, 1, 2])
    expect(JSON.stringify(lines[2])).toContain('c-新')
    expect(JSON.stringify(fs.files.get(journalPath(ROOT, REQ, 'comments')))).not.toContain('c-残留')
  })

  it('计数大于行数（数据丢失）→ 抛 COUNT_EXCEEDS_LINES，不静默降级', async () => {
    const { repo, fs } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ))
    fs.files.set(journalPath(ROOT, REQ, 'comments'), encodeJournalLine(line(0, 'c-0')))
    expect(await codeOf(repo.appendJournal(ROOT, REQ, 'comments', line(5, 'c-5'), 5))).toBe(JOURNAL_ERROR.COUNT_EXCEEDS_LINES)
  })

  it('行 seq 必须等于提交点计数（否则会写出跳号日志）→ VALIDATION_FAILED', async () => {
    const { repo } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ))
    expect(await codeOf(repo.appendJournal(ROOT, REQ, 'comments', line(3, 'c-3'), 2))).toBe(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED)
    expect(await codeOf(repo.appendJournal(ROOT, REQ, 'comments', line(1, 'c-1'), -1))).toBe(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED)
  })

  it('日志里有坏行 → 压实重写 + 告警（行不丢、seq 不乱）', async () => {
    const { repo, fs, warns } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ))
    fs.files.set(journalPath(ROOT, REQ, 'comments'), [encodeJournalLine(line(0, 'c-0')).trimEnd(), '{坏行', encodeJournalLine(line(1, 'c-1')).trimEnd()].join('\n'))
    // 有效行只有 2 条（seq 0/1），但中间夹了坏行 ⇒ 走重写路径
    await repo.appendJournal(ROOT, REQ, 'comments', line(2, 'c-2'), 2)
    const { lines, malformed } = await repo.readJournal(ROOT, REQ, 'comments')
    expect(malformed).toBe(0) // 重写后坏行被清掉
    expect(lines.map((l) => l.seq)).toEqual([0, 1, 2])
    expect(warns.some((w) => w.includes('压实'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 验收 ⑤ 目录枚举
// ---------------------------------------------------------------------------

describe('目录枚举（验收 ⑤）', () => {
  it('listHotIds 只返回目录，忽略文件、.corrupt 残留与非法命名', async () => {
    const { repo, fs } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ))
    await repo.writeObjectAtomic(ROOT, OTHER, 'plan', { x: 1 }) // 会建 OTHER 目录
    // 手工塞进各种干扰项
    fs.files.set('/data/reqboard/requirements/README.md', 'x') // 裸文件
    fs.files.set('/data/reqboard/requirements/REQ-261002161439-277d.corrupt-123/comments.jsonl', 'x') // 隔离残留目录
    fs.dirs.add('/data/reqboard/requirements/REQ-261002161439-277d.corrupt-123')
    fs.files.set('/data/reqboard/requirements/not-a-req/x', 'x')
    fs.dirs.add('/data/reqboard/requirements/not-a-req')

    expect(await repo.listHotIds(ROOT)).toEqual([OTHER, REQ].sort())
  })

  it('目录不存在 → 空数组（不是错误）；冷侧同理', async () => {
    const { repo } = makeRepo()
    expect(await repo.listHotIds(ROOT)).toEqual([])
    expect(await repo.listColdIds(ROOT)).toEqual([])
  })

  it('IO 失败（非 ENOENT）→ 抛 IO_FAILED，不静默返回空', async () => {
    const { repo, fs } = makeRepo()
    fs.faults.read = true
    expect(await codeOf(repo.readRecord(ROOT, REQ))).toBe(REQUIREMENT_STORE_ERROR.IO_FAILED)
  })
})

// ---------------------------------------------------------------------------
// 冷热搬运
// ---------------------------------------------------------------------------

describe('冷热搬运', () => {
  it('moveToCold：整目录搬到 archive/，热侧不再有、冷侧有、内容跟着走', async () => {
    const { repo } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ))
    await repo.writeObjectAtomic(ROOT, REQ, 'verification', { summary: 'v' })
    await repo.moveToCold(ROOT, REQ)
    expect(await repo.listHotIds(ROOT)).toEqual([])
    expect(await repo.listColdIds(ROOT)).toEqual([REQ])
    expect(await repo.readRecord(ROOT, REQ)).toBeUndefined() // 热侧路径读不到了
    expect((await repo.readRecord(ROOT, REQ, { cold: true }))?.id).toBe(REQ)
    expect((await repo.readObject<{ summary: string }>(ROOT, REQ, 'verification', { cold: true }))?.summary).toBe('v')
  })

  it('moveFromCold：搬回热侧；两侧都有同名目录 → 拒绝覆盖（VALIDATION_FAILED）', async () => {
    const { repo } = makeRepo()
    await repo.writeRecordAtomic(ROOT, REQ, record(REQ))
    await repo.moveToCold(ROOT, REQ)
    await repo.moveFromCold(ROOT, REQ)
    expect(await repo.listHotIds(ROOT)).toEqual([REQ])
    expect(await repo.listColdIds(ROOT)).toEqual([])

    await repo.writeRecordAtomic(ROOT, REQ, record(REQ)) // 热侧又有了
    await repo.moveToCold(ROOT, REQ).catch(() => { /* 先造一个冷侧冲突 */ })
    expect(await codeOf(repo.moveToCold(ROOT, REQ))).toBe(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED)
  })

  it('源目录不存在 → NOT_FOUND', async () => {
    const { repo } = makeRepo()
    expect(await codeOf(repo.moveToCold(ROOT, REQ))).toBe(REQUIREMENT_STORE_ERROR.NOT_FOUND)
  })
})
