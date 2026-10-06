import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAcceptanceGate } from '../src/application/internal/accept-sheet-rtm-integration.js';
import { generateStatusRTM } from '../src/application/internal/status-rtm-integration.js';
// 来源 → fr_id 的映射单点在 domain：两个 RTM 集成都调它（§10 #31），故此处的断言即"三处消费点"的判据。
import {
  rtmTraceIdOf,
  PROTOTYPE_COMPARE_CRITERION,
  DECISION_COMPARE_CRITERION,
  PROTOTYPE_COMPARE_TRACE_ID,
  DECISION_COMPARE_TRACE_ID,
} from '../src/domain/workflow/AcceptanceSheetSpec.js';
import type { VerificationSheet, VerificationItem, VerificationItemSource } from '../src/shared/protocol.js';

describe('AcceptSheet RTM Integration', () => {
  it('部分通过：12项验收（10 passed, 2 failed），返回gate_status=blocked, archived=false', () => {
    const sheet: VerificationSheet = {
      version: 1,
      items: [
        // 10 项 passed
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `item-${i + 1}`,
          source: { kind: 'task' as const, taskId: `t-${i + 1}` },
          criterion: `验收项${i + 1}`,
          howToVerify: `验证方式${i + 1}`,
          status: 'passed' as const,
          evidence: [`已通过 ${i + 1}`],
          decidedAt: Date.now(),
          decidedBy: { kind: 'human' as const, sessionId: 'test' },
          opinion: undefined
        })),
        // 2 项 failed
        {
          id: 'item-11',
          source: { kind: 'task' as const, taskId: 't-11' },
          criterion: '验收项11',
          howToVerify: '验证方式11',
          status: 'failed' as const,
          evidence: [],
          decidedAt: Date.now(),
          decidedBy: { kind: 'human' as const, sessionId: 'test' },
          opinion: 'Need rework'
        },
        {
          id: 'item-12',
          source: { kind: 'task' as const, taskId: 't-12' },
          criterion: '验收项12',
          howToVerify: '验证方式12',
          status: 'failed' as const,
          evidence: [],
          decidedAt: Date.now(),
          decidedBy: { kind: 'human' as const, sessionId: 'test' },
          opinion: 'Fix required'
        }
      ],
      reworkOnly: false,
      generatedAt: Date.now(),
      generatedBy: { kind: 'agent' as const, sessionId: 'test' }
    };

    const result = checkAcceptanceGate(sheet);

    // 验证门禁检查结果
    expect(result.gate_check.total).toBe(12);
    expect(result.gate_check.passed).toBe(10);
    expect(result.gate_check.failed).toBe(2);
    expect(result.gate_check.pending).toBe(0);
    expect(result.gate_check.pass_rate).toBe(83); // 10/12 ≈ 83%
    expect(result.gate_check.gate_status).toBe('blocked');
    
    // 验证不应该自动归档
    expect(result.should_archive).toBe(false);
  });

  it('全部通过：12项验收（12 passed），返回gate_status=passed, archived=true', () => {
    const sheet: VerificationSheet = {
      version: 1,
      items: Array.from({ length: 12 }, (_, i) => ({
        id: `item-${i + 1}`,
        source: { kind: 'task' as const, taskId: `t-${i + 1}` },
        criterion: `验收项${i + 1}`,
        howToVerify: `验证方式${i + 1}`,
        status: 'passed' as const,
        evidence: [`已通过 ${i + 1}`],
        decidedAt: Date.now(),
        decidedBy: { kind: 'human' as const, sessionId: 'test' },
        opinion: undefined
      })),
      reworkOnly: false,
      generatedAt: Date.now(),
      generatedBy: { kind: 'agent' as const, sessionId: 'test' }
    };

    const result = checkAcceptanceGate(sheet);

    // 验证门禁检查结果
    expect(result.gate_check.total).toBe(12);
    expect(result.gate_check.passed).toBe(12);
    expect(result.gate_check.failed).toBe(0);
    expect(result.gate_check.pending).toBe(0);
    expect(result.gate_check.pass_rate).toBe(100);
    expect(result.gate_check.gate_status).toBe('passed');
    
    // 验证应该自动归档
    expect(result.should_archive).toBe(true);
  });

  it('部分待验：10项验收（5 passed, 0 failed, 5 pending），返回gate_status=pending, archived=false', () => {
    const sheet: VerificationSheet = {
      version: 1,
      items: [
        // 5 项 passed
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `item-${i + 1}`,
          source: { kind: 'task' as const, taskId: `t-${i + 1}` },
          criterion: `验收项${i + 1}`,
          howToVerify: `验证方式${i + 1}`,
          status: 'passed' as const,
          evidence: [`已通过 ${i + 1}`],
          decidedAt: Date.now(),
          decidedBy: { kind: 'human' as const, sessionId: 'test' },
          opinion: undefined
        })),
        // 5 项 pending
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `item-${i + 6}`,
          source: { kind: 'task' as const, taskId: `t-${i + 6}` },
          criterion: `验收项${i + 6}`,
          howToVerify: `验证方式${i + 6}`,
          status: 'pending' as const,
          evidence: [],
          decidedAt: undefined,
          decidedBy: undefined,
          opinion: undefined
        }))
      ],
      reworkOnly: false,
      generatedAt: Date.now(),
      generatedBy: { kind: 'agent' as const, sessionId: 'test' }
    };

    const result = checkAcceptanceGate(sheet);

    // 验证门禁检查结果
    expect(result.gate_check.total).toBe(10);
    expect(result.gate_check.passed).toBe(5);
    expect(result.gate_check.failed).toBe(0);
    expect(result.gate_check.pending).toBe(5);
    expect(result.gate_check.pass_rate).toBe(50); // 5/10 = 50%
    expect(result.gate_check.gate_status).toBe('pending');
    
    // 验证不应该自动归档
    expect(result.should_archive).toBe(false);
  });

  it('兼容性：无验收单时返回默认值不报错', () => {
    const result = checkAcceptanceGate(undefined);

    expect(result.gate_check.total).toBe(0);
    expect(result.gate_check.passed).toBe(0);
    expect(result.gate_check.failed).toBe(0);
    expect(result.gate_check.pending).toBe(0);
    expect(result.gate_check.pass_rate).toBe(0);
    expect(result.gate_check.gate_status).toBe('pending');
    expect(result.should_archive).toBe(false);
  });
});

/* ------------------------------------------------------------------------- */
/* REQ-261005105032-3b02 t18：两个对照项 source 在三处消费点不得静默退化（§10 #31） */
/* ------------------------------------------------------------------------- */

/**
 * 验收单标本：四个来源各一条（任务 / 需求级 / 原型对照 / 裁定对照）。
 * 判据来自 interfaces.md「验收单项接口」：UI 需求必含原型对照项、有 D-x 时含裁定对照项。
 */
function sheetWithCompareItems(): VerificationSheet {
  const items: VerificationItem[] = [
    { id: 'v1-1', source: { kind: 'task', taskId: 't-aaaaaa' }, criterion: '任务项', evidence: [], status: 'pending' },
    { id: 'v1-2', source: { kind: 'requirement' }, criterion: '需求级', evidence: [], status: 'pending' },
    {
      id: 'v1-3',
      source: { kind: 'prototype-compare', prototypePath: 'prototypes/detail.html' },
      criterion: PROTOTYPE_COMPARE_CRITERION,
      evidence: [],
      status: 'pending',
      needsHuman: true,
      humanReason: '界面视觉需人对照权威原型',
    },
    {
      id: 'v1-4',
      source: { kind: 'decision-compare', decisionIds: ['D-3', 'D-5'] },
      criterion: DECISION_COMPARE_CRITERION,
      evidence: [],
      status: 'pending',
    },
  ]
  return { version: 1, items, reworkOnly: false, generatedAt: 1, generatedBy: { kind: 'agent' } } as unknown as VerificationSheet
}

describe('REQ-261005105032-3b02 t18：对照项 source 的 fr_id 映射（§10 #31）', () => {
  it('四个来源各有标识；两个新 kind 绝不落 UNKNOWN', () => {
    expect(rtmTraceIdOf({ kind: 'requirement' })).toBe('REQ-LEVEL')
    expect(rtmTraceIdOf({ kind: 'task', taskId: 't-aaaaaa' })).toBe('t-aaaaaa')
    expect(rtmTraceIdOf({ kind: 'prototype-compare', prototypePath: 'prototypes/detail.html' })).toBe(PROTOTYPE_COMPARE_TRACE_ID)
    expect(rtmTraceIdOf({ kind: 'decision-compare', decisionIds: ['D-3'] })).toBe(DECISION_COMPARE_TRACE_ID)
    // 退化判据（旧实现 `taskId ?? 'UNKNOWN'` 会让新 source 静默落这个值）
    const newSources: VerificationItemSource[] = [
      { kind: 'prototype-compare', prototypePath: 'prototypes/detail.html' },
      { kind: 'decision-compare', decisionIds: ['D-3'] },
    ]
    for (const s of newSources) {
      expect(rtmTraceIdOf(s), JSON.stringify(s)).not.toBe('UNKNOWN')
    }
  });

  it('accept-sheet-rtm-integration：喂两个对照项后照常出统计（映射不抛、计数不漏项）', () => {
    const result = checkAcceptanceGate(sheetWithCompareItems())
    expect(result.gate_check.total).toBe(4)
    expect(result.gate_check.pending).toBe(4)
    expect(result.gate_check.failed).toBe(0)
    expect(result.should_archive).toBe(false)
  });

  it('status-rtm-integration：同一份验收单照样统计（不留一项、不报错）', () => {
    const reqDir = mkdtempSync(join(tmpdir(), 'pmboard-status-rtm-'))
    try {
      const r = generateStatusRTM(reqDir, [], sheetWithCompareItems())
      // 对照项计入总数：若新 source 让映射抛错或整块跳过，这里会缺失
      expect(r.fr_acceptance_progress?.total).toBe(4)
      expect(r.fr_acceptance_progress?.pending).toBe(4)
    } finally {
      rmSync(reqDir, { recursive: true, force: true })
    }
  });
});
