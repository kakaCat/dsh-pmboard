/**
 * serves: BUG-1（run 快照只报活字段）
 * QueryRunStatus 用例测试
 */

import { describe, it, expect, vi } from 'vitest'
import { queryRunStatus } from '../../src/application/use-cases/QueryRunStatus.js'
import type { RequirementRecord, TaskRecord } from '../../src/client/types.js'

// 创建测试需求
function createRequirement(id: string, advance?: any): RequirementRecord {
  return {
    id,
    title: 'Test Requirement',
    description: 'Test',
    status: 'implementing',
    blocked: false,
    advance,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: { kind: 'agent', sessionId: 'test' },
    updatedBy: { kind: 'agent', sessionId: 'test' }
  } as RequirementRecord
}

// 创建测试任务
function createTask(id: string, status: 'todo' | 'done', dependsOn: string[] = []): TaskRecord {
  return {
    id,
    requirementId: 'REQ-test',
    title: `Task ${id}`,
    description: 'Test task',
    phase: 'implement',
    side: 'backend',
    dependsOn,
    scope: { apis: [], tables: [], files: [] },
    acceptance: 'Test',
    context: '',
    status,
    blocked: false,
    executions: [],
    comments: [],
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: { kind: 'agent', sessionId: 'test' },
    updatedBy: { kind: 'agent', sessionId: 'test' }
  } as TaskRecord
}

describe('QueryRunStatus', () => {
  describe('queryRunStatus', () => {
    it('无运行：返回 not_found 状态', async () => {
      const requirement = createRequirement('REQ-1')
      const tasks = [createTask('t1', 'todo')]
      
      const result = await queryRunStatus({
        requirementId: 'REQ-1',
        getRequirement: vi.fn().mockResolvedValue(requirement),
        getTasks: vi.fn().mockResolvedValue(tasks),
        dshJobsAdapter: { getJob: vi.fn() } as any
      })
      
      expect(result.runId).toBeNull()
      // REQ-261008011118-defe BUG-1（DD-1）：恒 0 的 `stepIndex` 不再存在于读数里（死字段已删）
      expect('stepIndex' in result).toBe(false)
      expect(result.jobStatus).toBe('not_found')
      expect(result.autoRun).toBe(false)
      expect(result.nextReady).toEqual(['t1'])
    })

    it('有 active run：返回运行信息（进度死字段被忽略，不出现在读数里）', async () => {
      // 夹具**故意**种入 stepIndex/currentSubtaskId 遗产字段：修前它们会被原样回报（读的就是夹具写的），
      // 修后必须被忽略——这条断言才是可证伪的（死字段的写侧在生产代码 0 调用方）。
      const requirement = createRequirement('REQ-1', {
        runId: 'run-123',
        stepIndex: 5,
        currentSubtaskId: 't-abc'
      })
      const tasks = [createTask('t1', 'todo')]
      
      const mockAdapter = {
        getJob: vi.fn().mockResolvedValue({
          status: 'running'
        })
      }
      
      const result = await queryRunStatus({
        requirementId: 'REQ-1',
        getRequirement: vi.fn().mockResolvedValue(requirement),
        getTasks: vi.fn().mockResolvedValue(tasks),
        dshJobsAdapter: mockAdapter as any
      })
      
      expect(result.runId).toBe('run-123')
      expect('stepIndex' in result).toBe(false)
      expect('currentSubtaskId' in result).toBe(false)
      expect(result.jobStatus).toBe('running')
      expect(result.autoRun).toBe(true)
    })

    it('job 状态：running', async () => {
      const requirement = createRequirement('REQ-1', {
        runId: 'run-123',
        stepIndex: 2
      })
      
      const mockAdapter = {
        getJob: vi.fn().mockResolvedValue({
          status: 'running'
        })
      }
      
      const result = await queryRunStatus({
        requirementId: 'REQ-1',
        getRequirement: vi.fn().mockResolvedValue(requirement),
        getTasks: vi.fn().mockResolvedValue([]),
        dshJobsAdapter: mockAdapter as any
      })
      
      expect(result.jobStatus).toBe('running')
      expect(result.autoRun).toBe(true)
    })

    it('job 状态：completed', async () => {
      const requirement = createRequirement('REQ-1', {
        runId: 'run-123',
        stepIndex: 3
      })
      
      const mockAdapter = {
        getJob: vi.fn().mockResolvedValue({
          status: 'completed'
        })
      }
      
      const result = await queryRunStatus({
        requirementId: 'REQ-1',
        getRequirement: vi.fn().mockResolvedValue(requirement),
        getTasks: vi.fn().mockResolvedValue([createTask('t1', 'done')]),
        dshJobsAdapter: mockAdapter as any
      })
      
      expect(result.jobStatus).toBe('completed')
      expect(result.autoRun).toBe(false)
    })

    it('job 状态：failed', async () => {
      const requirement = createRequirement('REQ-1', {
        runId: 'run-123',
        stepIndex: 1
      })
      
      const mockAdapter = {
        getJob: vi.fn().mockResolvedValue({
          status: 'failed'
        })
      }
      
      const result = await queryRunStatus({
        requirementId: 'REQ-1',
        getRequirement: vi.fn().mockResolvedValue(requirement),
        getTasks: vi.fn().mockResolvedValue([]),
        dshJobsAdapter: mockAdapter as any
      })
      
      expect(result.jobStatus).toBe('failed')
      expect(result.autoRun).toBe(false)
    })

    it('nextReady：返回可执行任务', async () => {
      const requirement = createRequirement('REQ-1')
      const tasks = [
        createTask('t1', 'done'),
        createTask('t2', 'todo'), // ready
        createTask('t3', 'todo', ['t2']) // 依赖 t2，not ready
      ]
      
      const result = await queryRunStatus({
        requirementId: 'REQ-1',
        getRequirement: vi.fn().mockResolvedValue(requirement),
        getTasks: vi.fn().mockResolvedValue(tasks),
        dshJobsAdapter: { getJob: vi.fn() } as any
      })
      
      expect(result.nextReady).toEqual(['t2'])
      expect(result.nextReady).not.toContain('t3')
    })

    it('pauseReason：有任务但都不 ready', async () => {
      const requirement = createRequirement('REQ-1', {
        runId: 'run-123',
        stepIndex: 1
      })
      const tasks = [
        createTask('t1', 'todo', ['t-nonexist']) // 依赖不存在
      ]
      
      const mockAdapter = {
        getJob: vi.fn().mockResolvedValue({
          status: 'completed'
        })
      }
      
      const result = await queryRunStatus({
        requirementId: 'REQ-1',
        getRequirement: vi.fn().mockResolvedValue(requirement),
        getTasks: vi.fn().mockResolvedValue(tasks),
        dshJobsAdapter: mockAdapter as any
      })
      
      expect(result.pauseReason).toBeDefined()
      expect(result.pauseReason).toContain('不 ready')
    })

    it('无 pauseReason：全部完成', async () => {
      const requirement = createRequirement('REQ-1', {
        runId: 'run-123',
        stepIndex: 5
      })
      const tasks = [createTask('t1', 'done')]
      
      const mockAdapter = {
        getJob: vi.fn().mockResolvedValue({
          status: 'completed'
        })
      }
      
      const result = await queryRunStatus({
        requirementId: 'REQ-1',
        getRequirement: vi.fn().mockResolvedValue(requirement),
        getTasks: vi.fn().mockResolvedValue(tasks),
        dshJobsAdapter: mockAdapter as any
      })
      
      expect(result.pauseReason).toBeUndefined()
    })

    it('job 不存在：返回 not_found', async () => {
      const requirement = createRequirement('REQ-1', {
        runId: 'run-123',
        stepIndex: 2
      })
      
      const mockAdapter = {
        getJob: vi.fn().mockResolvedValue(null)
      }
      
      const result = await queryRunStatus({
        requirementId: 'REQ-1',
        getRequirement: vi.fn().mockResolvedValue(requirement),
        getTasks: vi.fn().mockResolvedValue([]),
        dshJobsAdapter: mockAdapter as any
      })
      
      expect(result.jobStatus).toBe('not_found')
    })

    it('job 查询失败：返回 not_found', async () => {
      const requirement = createRequirement('REQ-1', {
        runId: 'run-123',
        stepIndex: 2
      })
      
      const mockAdapter = {
        getJob: vi.fn().mockRejectedValue(new Error('Job query failed'))
      }
      
      const result = await queryRunStatus({
        requirementId: 'REQ-1',
        getRequirement: vi.fn().mockResolvedValue(requirement),
        getTasks: vi.fn().mockResolvedValue([]),
        dshJobsAdapter: mockAdapter as any
      })
      
      expect(result.jobStatus).toBe('not_found')
    })
  })
})
