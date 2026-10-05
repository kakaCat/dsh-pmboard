/**
 * 归档豁免规则测试（REQ-261004183621-de3f t1）。
 *
 * 重点在**负例**：人的工作记录与证据一律不豁免（否则清单会悄悄变短，正是本需求要治的病）。
 */
import { describe, expect, it } from 'vitest'
import { ARCHIVE_EXEMPTIONS, matchArchiveExemption } from '../src/domain/requirement/archive-exemptions.ts'

describe('豁免规则常量', () => {
  it('每条规则都有 id / match / reason（豁免必须说得出为什么）', () => {
    expect(ARCHIVE_EXEMPTIONS.length).toBeGreaterThanOrEqual(4)
    for (const r of ARCHIVE_EXEMPTIONS) {
      expect(r.id.length).toBeGreaterThan(0)
      expect(r.reason.length).toBeGreaterThan(0)
      expect(r.match.glob !== undefined || r.match.dir !== undefined).toBe(true)
    }
  })

  it('规则 id 唯一（便于留痕与事后解释）', () => {
    const ids = ARCHIVE_EXEMPTIONS.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('matchArchiveExemption · 正例', () => {
  const cases: Array<[string, string]> = [
    ['rtm-design.yml', 'rtm-reports'],
    ['rtm-implementing/t-ab12cd.yml', 'rtm-dir'],
    ['rtm-lifecycle.yml', 'rtm-reports'],
    ['queue.json', 'ledger-mirror'],
    ['state/rtm-failures.json', 'runtime-state'],
  ]
  for (const [path, ruleId] of cases) {
    it(`${path} → 命中 ${ruleId}`, () => {
      expect(matchArchiveExemption(path)?.id).toBe(ruleId)
    })
  }

  it('嵌套路径的子目录段也参与判定（rtm-* 覆盖任意深度）', () => {
    expect(matchArchiveExemption('a/rtm-b/x.yml')?.id).toBe('rtm-dir')
  })

  it('Windows 分隔符与前置 ./ 归一后同样命中', () => {
    expect(matchArchiveExemption('./rtm-design.yml')?.id).toBe('rtm-reports')
    expect(matchArchiveExemption('state\\x.json')?.id).toBe('runtime-state')
  })
})

describe('matchArchiveExemption · 负例（人的工作记录与证据绝不豁免）', () => {
  const negatives = [
    'requirement.md',
    'decomposition.md',
    'verification.md',
    'design/architecture.md',
    'tasks/t-1.md',
    'tests/test-evidence.md',
    'reviews/t1-review.md',
    'evidence/x.txt',
    'evidence/gates.txt',
    'queue.json.bak', // 不是 queue.json
    'my-rtm-design.yml', // 不支持子串匹配
  ]
  for (const path of negatives) {
    it(`${path} 不豁免`, () => {
      expect(matchArchiveExemption(path)).toBeUndefined()
    })
  }

  it('空路径不豁免（不产生"没有路径也命中"的怪结果）', () => {
    expect(matchArchiveExemption('')).toBeUndefined()
  })
})
