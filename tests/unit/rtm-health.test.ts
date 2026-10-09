/**
 * RTM 健康检查功能测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileHostFs } from '../../src/adapters/FileHostFs.js'
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { 
  recordRTMFailure, 
  clearRTMFailure, 
  checkRTMHealth, 
  expectedRTMFiles 
} from '../../src/application/internal/rtm-health.js'
import type { RequirementRecord } from '../../src/shared/protocol.js'
// REQ-261006201814-ac4f u3：测试根改走单一事实源（临时目录）。
// 改前是 join(process.cwd(), '.test-rtm-health')——**写进真实工作树**，
// 沙箱（FR-5⑤-a）上线后这类写入会被内核直接拒绝（ERR_ACCESS_DENIED）。
import { testWorkspaceRoot } from '../helpers/workspace-root.js'

describe('RTM 健康检查', () => {
  const testDir = join(testWorkspaceRoot(), '.test-rtm-health')
  const stateDir = join(testDir, '.dsh-data', 'state')
  const reqDir = join(testDir, 'docs', 'requirements', 'REQ-test-001')
  // REQ-261008020617-088f RF-3：state 读写经 HostFsPort（根逐次显式，这里传测试根）
  const host = new FileHostFs()

  beforeEach(() => {
    // 创建测试目录
    mkdirSync(stateDir, { recursive: true })
    mkdirSync(reqDir, { recursive: true })
  })

  afterEach(() => {
    // 清理测试目录
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('应该根据需求状态返回期望的 RTM 文件列表', () => {
    expect(expectedRTMFiles('draft')).toEqual([])
    expect(expectedRTMFiles('brainstorming')).toContain('rtm-lifecycle.yml')
    expect(expectedRTMFiles('brainstorming')).toContain('rtm-brainstorming.yml')
    expect(expectedRTMFiles('design')).toContain('rtm-design.yml')
    expect(expectedRTMFiles('implementing')).toContain('rtm-implementing.yml')
  })

  it('应该记录 RTM 生成失败', () => {
    recordRTMFailure(host, testDir, 'REQ-test-001', 'create', '测试错误')
    
    const failuresFile = join(stateDir, 'rtm-failures.json')
    expect(existsSync(failuresFile)).toBe(true)
    
    const failures = JSON.parse(require('fs').readFileSync(failuresFile, 'utf-8'))
    expect(failures).toHaveLength(1)
    expect(failures[0].requirement_id).toBe('REQ-test-001')
    expect(failures[0].trigger).toBe('create')
    expect(failures[0].error).toBe('测试错误')
    expect(failures[0].attempts).toBe(1)
  })

  it('应该累加连续失败次数', () => {
    recordRTMFailure(host, testDir, 'REQ-test-001', 'create', '错误1')
    recordRTMFailure(host, testDir, 'REQ-test-001', 'submit:requirement', '错误2')
    
    const failures = JSON.parse(
      require('fs').readFileSync(join(stateDir, 'rtm-failures.json'), 'utf-8')
    )
    expect(failures).toHaveLength(1)
    expect(failures[0].attempts).toBe(2)
    expect(failures[0].error).toBe('错误2')
  })

  it('应该在成功后清除失败记录', () => {
    recordRTMFailure(host, testDir, 'REQ-test-001', 'create', '测试错误')
    clearRTMFailure(host, testDir, 'REQ-test-001')
    
    const failures = JSON.parse(
      require('fs').readFileSync(join(stateDir, 'rtm-failures.json'), 'utf-8')
    )
    expect(failures).toHaveLength(0)
  })

  it('应该检测缺失的 RTM 文件', () => {
    const req: RequirementRecord = {
      id: 'REQ-test-001',
      title: '测试需求',
      status: 'brainstorming',
      category: 'feature',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      comments: [],
      blocked: false,
      statusHistory: [],
    } as any

    const health = checkRTMHealth(host, testDir, req)
    
    expect(health.healthy).toBe(false)
    expect(health.missing_files).toContain('rtm-lifecycle.yml')
    expect(health.missing_files).toContain('rtm-brainstorming.yml')
    expect(health.retry_available).toBe(true)
  })

  it('应该在所有文件存在时返回健康状态', () => {
    // 创建所需的 RTM 文件
    writeFileSync(join(reqDir, 'rtm-lifecycle.yml'), 'test')
    writeFileSync(join(reqDir, 'rtm-brainstorming.yml'), 'test')
    
    const req: RequirementRecord = {
      id: 'REQ-test-001',
      title: '测试需求',
      status: 'brainstorming',
      category: 'feature',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      comments: [],
      blocked: false,
      statusHistory: [],
    } as any

    const health = checkRTMHealth(host, testDir, req)
    
    expect(health.healthy).toBe(true)
    expect(health.missing_files).toHaveLength(0)
  })

  it('应该在失败次数超过3次后禁用重试', () => {
    recordRTMFailure(host, testDir, 'REQ-test-001', 'create', '错误1')
    recordRTMFailure(host, testDir, 'REQ-test-001', 'create', '错误2')
    recordRTMFailure(host, testDir, 'REQ-test-001', 'create', '错误3')
    
    const req: RequirementRecord = {
      id: 'REQ-test-001',
      title: '测试需求',
      status: 'brainstorming',
      category: 'feature',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      comments: [],
      blocked: false,
      statusHistory: [],
    } as any

    const health = checkRTMHealth(host, testDir, req)
    
    expect(health.retry_available).toBe(false)
    expect(health.last_failure?.attempts).toBe(3)
  })

  it('state 目录不存在时也能落盘（适配器按需建目录，且不留 .tmp-*）', () => {
    // REQ-261008020617-088f RF-3：改前 writeFailures 不建目录 ⇒ 抛错（被调用方吞掉、证据丢失），
    // 且 finally 里的 require('fs') 在 ESM 下必抛 ⇒ 残留 .tmp-*。改后由 FileHostFs 建目录 + rename。
    const freshRoot = join(testWorkspaceRoot(), '.test-rtm-health-nostate')
    rmSync(freshRoot, { recursive: true, force: true })
    expect(existsSync(join(freshRoot, '.dsh-data', 'state'))).toBe(false)

    expect(() => recordRTMFailure(host, freshRoot, 'REQ-nostate', 'create', '目录缺失')).not.toThrow()

    const stateFile = join(freshRoot, '.dsh-data', 'state', 'rtm-failures.json')
    expect(existsSync(stateFile)).toBe(true)
    const raw = readFileSync(stateFile, 'utf-8')
    // 落盘形状逐字：2 空格缩进 + 五键齐（requirement_id / trigger / timestamp / error / attempts）
    expect(raw).toContain('\n  {\n    "requirement_id": "REQ-nostate"')
    expect(Object.keys(JSON.parse(raw)[0]).sort()).toEqual(['attempts', 'error', 'requirement_id', 'timestamp', 'trigger'])
    expect(JSON.parse(raw)[0].attempts).toBe(1)
    // 不留临时文件
    expect(readdirSync(join(freshRoot, '.dsh-data', 'state')).filter(f => f.includes('.tmp-'))).toEqual([])
    rmSync(freshRoot, { recursive: true, force: true })
  })

})
