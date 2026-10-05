/**
 * 子卡模板的验收标准必须"照着验"（REQ-261001170807-06fd t3/t4 · serves: FR-2）。
 *
 * 缺陷形态：模板产出的是断言词（"相关测试或命令跑通并附输出摘要"），而验收门禁要**可执行操作**——
 * 两者口径不一致，代价是收尾时逐张回补（REQ-261001154450-b918 实测回补 38 张）。
 */
import { describe, it, expect } from 'vitest'
import { STAGE_ACCEPTANCE } from '../src/domain/task/SubtaskTemplate.js'

/** 门禁认得的"可执行锚点"：命令 / git 子命令 / 明确的路径（用子串判定，避免正则转义坑）。 */
const ANCHORS = ['npx ', 'pnpm ', 'npm ', 'git diff', 'docs/requirements']

describe('子卡验收模板（FR-2）', () => {
  it('每个阶段的验收标准都含可执行锚点（不再退回断言词）', () => {
    const bad = Object.entries(STAGE_ACCEPTANCE).filter(([, v]) => !ANCHORS.some(a => v.includes(a))).map(([k]) => k)
    expect(bad).toEqual([])
  })

  it('研发/测试/复核三阶段的锚点具体到命令', () => {
    expect(STAGE_ACCEPTANCE.dev).toContain('npx vitest run')
    expect(STAGE_ACCEPTANCE.review).toContain('docs/requirements/')
    expect(STAGE_ACCEPTANCE.test).toContain('pnpm test')
  })
})
