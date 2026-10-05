/**
 * L1 领域单测 · 追加日志编解码与计数截断（REQ-261002161439-277d · t1 / FR-3）。
 *
 * 覆盖卡上验收 ③：`truncateByCount` 对「日志比计数多一行」返回有效前缀，
 * 对「计数大于行数」的处置**定死为抛错**（`COUNT_EXCEEDS_LINES`）——那是数据丢失，
 * 不允许静默降级成"少几条评论"。
 *
 * 为什么这几条值得单测：提交顺序是"先日志、后记录"，崩溃残留是**正常态**；
 * 而计数大于行数**不是**正常态。两种形态只差一个 `seq`，机器不判就只能靠人眼看——
 * 看漏的代价是静默丢数据。
 */
import { describe, it, expect } from 'vitest'
import {
  JOURNAL_ERROR,
  advanceRecordOf,
  commentOf,
  decodeJournalLine,
  encodeJournalLine,
  nextSeq,
  parseJournal,
  statusEventOf,
  toAdvanceLine,
  toCommentLine,
  toStatusLine,
  truncateByCount,
  type CommentJournalLine,
  type StatusJournalLine,
} from '../../src/domain/requirement/Journal.js'

const BY_HUMAN = { kind: 'human' as const }
const BY_AGENT = { kind: 'agent' as const, sessionId: 'session-1' }

const COMMENT_0: CommentJournalLine = { seq: 0, id: 'c-a1', body: '第一条评论', createdAt: 1000, createdBy: BY_AGENT }
const COMMENT_1: CommentJournalLine = { seq: 1, id: 'c-b2', body: '第二条评论', createdAt: 2000, createdBy: BY_HUMAN }
const STATUS_0: StatusJournalLine = { seq: 0, kind: 'status', status: 'draft', at: 10, by: BY_AGENT, reason: '立项' }
const STATUS_1: StatusJournalLine = { seq: 1, kind: 'status', status: 'design', at: 20, by: BY_HUMAN, inferred: true }

describe('编解码：三类行往返不丢字段', () => {
  it('评论行往返', () => {
    const line = encodeJournalLine(COMMENT_0)
    expect(line.endsWith('\n')).toBe(true)
    expect(decodeJournalLine(line)).toEqual(COMMENT_0)
  })

  it('无 createdBy 的评论行也不凭空补键', () => {
    const bare: CommentJournalLine = { seq: 3, id: 'c-x', body: 'x', createdAt: 1 }
    const decoded = decodeJournalLine(encodeJournalLine(bare))
    expect(decoded).toEqual(bare)
    expect('createdBy' in decoded!).toBe(false)
  })

  it('历史行（status）往返，含 inferred 与 tokenSnapshot', () => {
    const withSnap: StatusJournalLine = { ...STATUS_1, tokenSnapshot: { total: 1234 } as never }
    expect(decodeJournalLine(encodeJournalLine(STATUS_0))).toEqual(STATUS_0)
    expect(decodeJournalLine(encodeJournalLine(withSnap))).toEqual(withSnap)
  })

  it('历史行（advance）往返', () => {
    const line = toAdvanceLine(2, {
      at: 30,
      requirementId: 'REQ-261002161439-277d',
      event: 'RUN_SUBTASK',
      outcome: 'ok',
      durationMs: 42,
      detail: '跑了一张子卡',
      parentId: 't-061b26',
      subtaskId: 't-1dac0f',
    })
    expect(decodeJournalLine(encodeJournalLine(line))).toEqual(line)
  })

  it('编解码是幂等的（重编同一行得到同一文本）', () => {
    const once = encodeJournalLine(COMMENT_1)
    expect(encodeJournalLine(decodeJournalLine(once)!)).toBe(once)
  })
})

describe('decodeJournalLine：不可信的行返回 undefined，不猜', () => {
  const bad = [
    '',
    '   ',
    'not json',
    '[1,2,3]',
    '"a string"',
    '{"seq":-1,"id":"c","body":"b","createdAt":1}',
    '{"seq":1.5,"id":"c","body":"b","createdAt":1}',
    '{"seq":0,"body":"缺 id","createdAt":1}',
    '{"seq":0,"id":"c","createdAt":"not-number"}',
    '{"seq":0,"kind":"unknown","status":"draft"}',
    '{"seq":0,"kind":"status","at":1,"by":{"kind":"agent"}}',
    '{"seq":0,"kind":"status","status":"draft","at":"昨天"}',
    '{"seq":0,"kind":"status","status":"draft","by":{"kind":"不存在的角色"}}',
    '{"seq":0,"kind":"advance","at":1,"event":"PAUSE"}',
    '{"seq":0,"kind":"advance","at":1,"requirementId":"R","event":"PAUSE","outcome":"成功"}',
  ]
  it.each(bad)('拒绝：%s', (text) => {
    expect(decodeJournalLine(text)).toBeUndefined()
  })
})

describe('parseJournal：坏行计数而不吞掉', () => {
  it('空行不算坏行，坏行计入 malformed', () => {
    const text = [
      encodeJournalLine(COMMENT_0).trimEnd(),
      '',
      '{ 坏行',
      encodeJournalLine(COMMENT_1).trimEnd(),
      '   ',
    ].join('\n')
    const { lines, malformed } = parseJournal(text)
    expect(lines).toEqual([COMMENT_0, COMMENT_1])
    expect(malformed).toBe(1)
  })

  it('CRLF 与文件尾换行都能处理', () => {
    const text = encodeJournalLine(COMMENT_0).trimEnd() + '\r\n' + encodeJournalLine(COMMENT_1)
    const { lines, malformed } = parseJournal(text)
    expect(lines.map((l) => l.seq)).toEqual([0, 1])
    expect(malformed).toBe(0)
  })

  it('空文件 → 零行零坏行零缺陷', () => {
    expect(parseJournal('')).toEqual({ lines: [], malformed: 0, defects: [] })
  })

  it('缺字段的行**不丢**：保留并登记缺陷（真实数据实测：3 条评论缺 body、1 条状态缺 at、1 条缺 by）', () => {
    const text = [
      '{"seq":0,"id":"c-1","createdAt":10}', // 缺 body
      '{"seq":1,"id":"c-2","body":"正常","createdAt":20}',
      '{"seq":2,"kind":"status","status":"draft"}', // 缺 at 与 by
    ].join('\n')
    const { lines, malformed, defects } = parseJournal(text)
    expect(malformed).toBe(0)
    expect(lines).toHaveLength(3) // 行一条都没丢 —— seq 不变量因此不破
    expect(commentOf(lines[0] as never).body).toBe('')
    expect(statusEventOf(lines[2] as never)).toMatchObject({ status: 'draft', at: 0, by: { kind: 'system' } })
    expect(defects).toEqual([
      { seq: 0, field: 'body' },
      { seq: 2, field: 'at' },
      { seq: 2, field: 'by' },
    ])
  })

  it('推进事件缺 outcome/durationMs/detail 时同样保留 + 登记缺陷', () => {
    const { lines, malformed, defects } = parseJournal('{"seq":0,"kind":"advance","at":1,"requirementId":"R","event":"PAUSE"}')
    expect(malformed).toBe(0)
    expect(lines).toHaveLength(1)
    expect(advanceRecordOf(lines[0] as never)).toMatchObject({ outcome: 'noop', durationMs: 0, detail: '' })
    expect(defects.map((d) => d.field)).toEqual(['outcome', 'durationMs', 'detail'])
  })

  it('身份字段缺失或类型错 = 结构损坏（不填假值，判 malformed）', () => {
    const text = [
      '{"seq":0,"body":"缺 id","createdAt":1}',
      '{"seq":1,"kind":"status","at":1,"by":{"kind":"agent"}}', // 缺 status
      '{"seq":2,"id":"c-3","body":123,"createdAt":1}', // body 类型错
      '{"seq":3,"id":"c-4","body":"x","createdAt":"2026"}', // createdAt 类型错
    ].join('\n')
    const { lines, malformed } = parseJournal(text)
    expect(lines).toEqual([])
    expect(malformed).toBe(4)
  })

  it('真实数据形态回放：4 条残缺行混在完好行里，计数截断仍然成立', () => {
    const rows = [
      '{"seq":0,"id":"c-0","body":"完好","createdAt":1}',
      '{"seq":1,"id":"c-1","createdAt":2}',
      '{"seq":2,"id":"c-2","body":"完好","createdAt":3}',
      '{"seq":3,"id":"c-3","createdAt":4}',
      '{"seq":4,"id":"c-4","body":"完好","createdAt":5}',
      '{"seq":5,"id":"c-5","createdAt":6}',
      '{"seq":6,"kind":"status","status":"draft","at":7,"by":{"kind":"human"}}',
      '{"seq":7,"kind":"status","status":"design","at":8,"by":{"kind":"human"}}',
      '{"seq":8,"kind":"status","status":"design"}',
    ].join('\n')
    const { lines, malformed, defects } = parseJournal(rows)
    expect(malformed).toBe(0)
    expect(defects.map((d) => d.field)).toEqual(['body', 'body', 'body', 'at', 'by'])
    // 关键：缺陷行仍在，所以按 9 条截断不会抛错（旧策略会因丢 5 行而硬失败）
    expect(truncateByCount(lines, 9)).toHaveLength(9)
    expect(nextSeq(lines)).toBe(9)
  })
})

describe('truncateByCount：有效前缀 = seq ∈ [0, count)', () => {
  it('日志比计数多一行（崩溃残留）→ 返回有效前缀，不报错', () => {
    const lines = [COMMENT_0, COMMENT_1, { seq: 2, id: 'c-c3', body: '未提交', createdAt: 3000 }]
    expect(truncateByCount(lines, 2)).toEqual([COMMENT_0, COMMENT_1])
  })

  it('计数等于行数 → 全量返回', () => {
    expect(truncateByCount([COMMENT_0, COMMENT_1], 2)).toEqual([COMMENT_0, COMMENT_1])
  })

  it('计数为 0 → 空前缀（新需求、日志刚建）', () => {
    expect(truncateByCount([COMMENT_0], 0)).toEqual([])
  })

  it('乱序入参按 seq 归位', () => {
    expect(truncateByCount([COMMENT_1, COMMENT_0], 2)).toEqual([COMMENT_0, COMMENT_1])
  })

  it('计数大于行数（提交点指向不存在的行 = 数据丢失）→ 响亮抛错', () => {
    try {
      truncateByCount([COMMENT_0], 3)
      throw new Error('应当抛错')
    } catch (err) {
      expect((err as { code?: string }).code).toBe(JOURNAL_ERROR.COUNT_EXCEEDS_LINES)
      expect((err as Error).message).toContain('数据丢失')
    }
  })

  it('中间有坏行（被 parseJournal 剔除）导致有效行不足 → 同样抛错', () => {
    const text = [COMMENT_0, '坏行', COMMENT_1].map((l) => (typeof l === 'string' ? l : encodeJournalLine(l).trimEnd())).join('\n')
    const { lines } = parseJournal(text)
    expect(lines).toEqual([COMMENT_0, COMMENT_1])
    expect(() => truncateByCount(lines, 3)).toThrowError()
  })

  it('seq 重复（文件不满足不变量）→ SEQ_MISMATCH', () => {
    try {
      truncateByCount([COMMENT_0, { seq: 0, id: 'c-dup', body: 'dup', createdAt: 1 }], 2)
      throw new Error('应当抛错')
    } catch (err) {
      expect((err as { code?: string }).code).toBe(JOURNAL_ERROR.SEQ_MISMATCH)
    }
  })

  it('脏计数（负数 / 小数 / NaN）→ INVALID_COUNT', () => {
    for (const bad of [-1, 1.5, Number.NaN]) {
      try {
        truncateByCount([COMMENT_0], bad)
        throw new Error('应当抛错')
      } catch (err) {
        expect((err as { code?: string }).code).toBe(JOURNAL_ERROR.INVALID_COUNT)
      }
    }
  })
})

describe('nextSeq：下一行写在哪儿', () => {
  it('空日志从 0 起', () => {
    expect(nextSeq([])).toBe(0)
  })

  it('连续日志取下一条', () => {
    expect(nextSeq([COMMENT_0, COMMENT_1])).toBe(2)
  })

  it('残留尾巴也参与（追加前先截断，故取 max+1 即覆盖那一行）', () => {
    expect(nextSeq([{ seq: 0 }, { seq: 5 }])).toBe(6)
  })
})

describe('装配转换：日志行 → 领域记录（丢 seq / kind）', () => {
  it('评论：commentOf 去掉 seq，保留 createdBy', () => {
    expect(commentOf(COMMENT_0)).toEqual({ id: 'c-a1', body: '第一条评论', createdAt: 1000, createdBy: BY_AGENT })
    expect('seq' in commentOf(COMMENT_0)).toBe(false)
  })

  it('状态事件：statusEventOf 去掉 seq 与 kind', () => {
    const e = statusEventOf(STATUS_1)
    expect(e).toEqual({ status: 'design', at: 20, by: BY_HUMAN, inferred: true })
    expect('seq' in e).toBe(false)
    expect('kind' in e).toBe(false)
  })

  it('推进事件：advanceRecordOf 去掉 seq 与 kind', () => {
    const line = toAdvanceLine(0, {
      at: 1,
      requirementId: 'REQ-261002161439-277d',
      event: 'PAUSE',
      outcome: 'failed',
      durationMs: 7,
      detail: '失败即暂停',
    })
    const rec = advanceRecordOf(line)
    expect(rec.detail).toBe('失败即暂停')
    expect('seq' in rec).toBe(false)
    expect('kind' in rec).toBe(false)
  })

  it('构造 → 装配 往返等价（statusHistory / comments 的真实读写路径）', () => {
    const comment = { id: 'c-zz', body: '正文', createdAt: 9, createdBy: BY_HUMAN }
    expect(commentOf(toCommentLine(0, comment))).toEqual(comment)
    const event = { status: 'implementing', at: 11, by: BY_AGENT, reason: '推进' }
    expect(statusEventOf(toStatusLine(0, event))).toEqual(event)
  })
})

describe('JSON Lines 格式性质：一行恒为一条记录', () => {
  it('正文含换行 / 引号 / 反斜杠 / emoji 时，仍只占一行且往返等价', () => {
    const tricky = '第一行\n第二行 "带引号" \\反斜杠\\ 🧩 \r\n 结尾'
    const line = toCommentLine(0, { id: 'c-nl', body: tricky, createdAt: 1 })
    const encoded = encodeJournalLine(line)
    expect(encoded.trimEnd().includes('\n')).toBe(false) // 正文里的换行被转义，未泄漏成真实换行
    const { lines, malformed } = parseJournal(encoded)
    expect(malformed).toBe(0)
    expect(lines).toHaveLength(1)
    expect(commentOf(lines[0] as never).body).toBe(tricky)
  })

  it('多行混合时按行切分不串档', () => {
    const a = toCommentLine(0, { id: 'c-a', body: 'a\n with newline', createdAt: 1 })
    const b = toCommentLine(1, { id: 'c-b', body: 'b', createdAt: 2 })
    const { lines } = parseJournal(encodeJournalLine(a) + encodeJournalLine(b))
    expect(lines.map((l) => l.seq)).toEqual([0, 1])
    expect(commentOf(lines[0] as never).body).toBe('a\n with newline')
  })

  it('历史行（status）同理不因正文换行断行', () => {
    const line = toStatusLine(0, { status: 'draft', at: 1, by: BY_AGENT, reason: '第一行\n第二行' })
    const { lines, malformed } = parseJournal(encodeJournalLine(line))
    expect(malformed).toBe(0)
    expect(statusEventOf(lines[0] as never).reason).toBe('第一行\n第二行')
  })
})
