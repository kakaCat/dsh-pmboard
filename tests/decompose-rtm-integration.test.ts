import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateRTMData } from '../src/application/internal/rtm-integration.js';
import type { TaskRecord } from '../src/shared/protocol.js';
import { task } from './application/harness.js';

describe('Decompose RTM Integration', () => {
  let testDir: string;
  let reqDir: string;

  beforeEach(() => {
    // 创建临时测试目录
    testDir = mkdtempSync(join(tmpdir(), 'decompose-rtm-test-'));
    reqDir = join(testDir, 'REQ-TEST');
    const frDir = join(reqDir, 'functional-requirements');
    mkdirSync(frDir, { recursive: true });

    // 创建测试 FR 文件
    writeFileSync(join(frDir, 'FR-1-test-feature.md'), `# FR-1: 测试功能1

**验收标准**:
- A1: 验收项1
- A2: 验收项2
`);

    writeFileSync(join(frDir, 'FR-2-test-feature.md'), `# FR-2: 测试功能2

**验收标准**:
- A1: 验收项1
- A2: 验收项2
`);

    writeFileSync(join(frDir, 'FR-3-test-feature.md'), `# FR-3: 测试功能3

**验收标准**:
- A1: 验收项1
`);
  });

  afterEach(() => {
    // 清理测试目录
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('完全覆盖：2个任务覆盖3个FR，返回coverage_rate=100%', async () => {
    const tasks: TaskRecord[] = [
      task({
        id: 't-1',
        title: '任务1',
        requirementRefs: ['FR-1', 'FR-2'],
        status: 'todo',
        phase: 'implement',
        side: 'backend',
      }),
      task({
        id: 't-2',
        title: '任务2',
        requirementRefs: ['FR-3'],
        status: 'todo',
        phase: 'implement',
        side: 'backend',
      }),
    ];

    const result = await generateRTMData(reqDir, tasks);

    // 验证 task_coverage
    expect(result.task_coverage).toHaveLength(2);
    expect(result.task_coverage[0].covers_frs).toEqual(['FR-1', 'FR-2']);
    expect(result.task_coverage[0].covers_acceptance).toContain('FR-1-A1');
    expect(result.task_coverage[0].covers_acceptance).toContain('FR-2-A1');
    expect(result.task_coverage[1].covers_frs).toEqual(['FR-3']);

    // 验证 coverage_check
    expect(result.coverage_check.total_frs).toBe(3);
    expect(result.coverage_check.covered_frs).toBe(3);
    expect(result.coverage_check.coverage_rate).toBe(100);
    expect(result.coverage_check.unreceived_clauses).toEqual([]);
  });

  it('部分覆盖：2个任务只覆盖2个FR，返回coverage_rate=67%', async () => {
    const tasks: TaskRecord[] = [
      task({
        id: 't-1',
        title: '任务1',
        requirementRefs: ['FR-1'],
        status: 'todo',
        phase: 'implement',
        side: 'backend',
      }),
      task({
        id: 't-2',
        title: '任务2',
        requirementRefs: ['FR-2'],
        status: 'todo',
        phase: 'implement',
        side: 'backend',
      }),
    ];

    const result = await generateRTMData(reqDir, tasks);

    // 验证 coverage_check
    expect(result.coverage_check.total_frs).toBe(3);
    expect(result.coverage_check.covered_frs).toBe(2);
    expect(result.coverage_check.coverage_rate).toBe(67); // 2/3 ≈ 67%
    expect(result.coverage_check.unreceived_clauses).toEqual(['FR-3']);
  });

  it('一对多：一条 FR 被 3 张接口卡接收（REQ-261007125552-32cb FR-6 / TC-9 RTM 侧）', async () => {
    // 接口级拆分后的常态：契约卡 + 实现卡同接一条 FR。RTM 必须如实一对多，不丢边、不降覆盖。
    const ifaceCards = ['t-1', 't-2', 't-3'].map((id, i) =>
      task({
        id,
        title: '接口卡' + String(i + 1),
        requirementRefs: ['FR-1'],
        status: 'todo',
        phase: 'implement',
        side: 'backend',
      }),
    )
    // 夹具目录有 FR-1/2/3 三份：FR-2/FR-3 各补一张接收卡，隔离「覆盖率下降」这个干扰项
    const rest = [
      task({ id: 't-4', title: '丁', requirementRefs: ['FR-2'], status: 'todo', phase: 'implement', side: 'backend' }),
      task({ id: 't-5', title: '戊', requirementRefs: ['FR-3'], status: 'todo', phase: 'implement', side: 'backend' }),
    ]
    const tasks: TaskRecord[] = [...ifaceCards, ...rest]

    const result = await generateRTMData(reqDir, tasks);

    // covers_frs 一对三：三张接口卡各自挂 FR-1（一条边都不丢）
    expect(result.task_coverage).toHaveLength(5);
    for (const row of result.task_coverage.slice(0, 3)) {
      expect(row.covers_frs).toEqual(['FR-1']);
    }
    // 条款接收状态：FR-1 received（未接收清单为空）、覆盖率不降
    expect(result.coverage_check.coverage_rate).toBe(100);
    expect(result.coverage_check.unreceived_clauses).toEqual([]);
  });

  it('兼容性：无FR文件时返回空数据不报错', async () => {
    // 删除所有 FR 文件
    rmSync(join(reqDir, 'functional-requirements'), { recursive: true, force: true });

    const tasks: TaskRecord[] = [
      task({
        id: 't-1',
        title: '任务1',
        requirementRefs: [],
        status: 'todo',
        phase: 'implement',
        side: 'backend',
      }),
    ];

    const result = await generateRTMData(reqDir, tasks);

    // 无 FR 文件，应该返回空数据（0/0 = 100%）
    expect(result.task_coverage).toHaveLength(1);
    expect(result.coverage_check.total_frs).toBe(0);
    expect(result.coverage_check.coverage_rate).toBe(100); // 0/0 定义为 100%
  });
});
