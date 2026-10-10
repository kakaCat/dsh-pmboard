import type { TaskCoverage, FRMetadata } from '../types/rtm.js'
import type { Coverage } from './types.js'
import {
  calculateDecisionReferenceCoverage,
  calculatePrototypeAnchorCoverage,
  collectDecisionReferenceIds,
  toDecisionReferencingTasks,
  toPrototypeAnchorTasks,
  type DecisionReferenceInput,
  type TraceabilityTaskLike,
} from './coverage-calculator.js'

/**
 * 覆盖度检查结果
 */
export interface CoverageCheckResult {
  /** FR 总数 */
  total_frs: number;
  /** 被覆盖的 FR 数量 */
  covered_frs: number;
  /** 未被覆盖的 FR 列表 */
  unreceived_clauses: string[];
  /** 覆盖率（百分比） */
  coverage_rate: number;
}

/** 新两维的名字（点名消息与断言都按它走，避免各处写散字符串）。 */
export type TraceabilityDimension = 'prototype_anchors' | 'decision_refs'

/** 单维裁决：覆盖度 + 点名（本两维**不阻断**，故没有 passed/failed）。 */
export interface DimensionVerdict {
  dimension: TraceabilityDimension
  /** 该维覆盖度（分母口径见 coverage-calculator 的对应 calculate*）。 */
  coverage: Coverage
  /** 未覆盖项点名：UI 卡编号 / D-x 编号。 */
  gaps: string[]
  /** 未覆盖时的一句话（覆盖度 100% 时缺省）。 */
  message?: string
}

/** 两维合计结果。 */
export interface PrototypeTraceabilityResult {
  /** ① UI 卡原型锚点维。 */
  prototype_anchors: DimensionVerdict
  /** ② 每条 D-x 被引用维。 */
  decision_refs: DimensionVerdict
  /** 两维合并点名（卡编号 + D-x），供人一屏看完要补什么。 */
  gaps: string[]
  /**
   * 恒 `false`：本两维**只降覆盖度并点名，不拒绝阶段转移**（data-model §6.4、
   * requirement.md 验收标准 13 的措辞是"覆盖度点名该 D-x"，不是"被拒"）。
   * 显式留这个字段，是为了让调用方看见"这里没有裁决权"，不会误当成门禁结果。
   */
  blocking: false
}

/** 两维检查的输入。 */
export interface PrototypeTraceabilityInput {
  /** 需求分类（只有 feature/refactor 才要求 UI 卡带锚点）。 */
  category: string
  /** 全部任务卡（RTM `task_coverage[]` 与台账任务投影都可直接传）。 */
  tasks: readonly TraceabilityTaskLike[]
  /** 全部 D-x 编号（`rtm-brainstorming.yml` `outputs.decisions[].id`）；缺省 = 无 D-x（真空 100%）。 */
  decisions?: readonly string[]
  /** FR 明细 / 设计章节侧的编号引用（设计章节 `serves` 里的 D-x 即此类）。 */
  clauseRefs?: readonly string[]
}

/**
 * 覆盖度检查器
 * 校验所有 FR 是否被任务覆盖
 */
export class CoverageChecker {
  /**
   * 检查覆盖度
   * @param frMetadata 所有 FR 元数据
   * @param taskCoverage 任务覆盖追踪列表
   * @returns 覆盖度检查结果
   */
  static checkCoverage(
    frMetadata: FRMetadata[],
    taskCoverage: TaskCoverage[]
  ): CoverageCheckResult {
    // 1. 收集所有 FR ID
    const allFRs = new Set(frMetadata.map(fr => fr.id));
    
    // 2. 收集已被任务覆盖的 FR ID
    const coveredFRs = new Set<string>();
    for (const tc of taskCoverage) {
      for (const frId of tc.covers_frs) {
        coveredFRs.add(frId);
      }
    }
    
    // 3. 计算未覆盖的 FR
    const unreceivedClauses: string[] = [];
    for (const frId of allFRs) {
      if (!coveredFRs.has(frId)) {
        unreceivedClauses.push(frId);
      }
    }
    
    // 4. 计算覆盖率
    const totalFRs = allFRs.size;
    const coveredCount = coveredFRs.size;
    const coverageRate = totalFRs > 0 ? Math.round((coveredCount / totalFRs) * 100) : 100;
    
    return {
      total_frs: totalFRs,
      covered_frs: coveredCount,
      unreceived_clauses: unreceivedClauses.sort(), // 排序，方便测试
      coverage_rate: coverageRate
    };
  }
  
  /**
   * 验证覆盖度（100% 覆盖时通过，否则抛出错误）
   * @param frMetadata 所有 FR 元数据
   * @param taskCoverage 任务覆盖追踪列表
   * @throws Error 当覆盖度 < 100% 时
   */
  static validateCoverage(
    frMetadata: FRMetadata[],
    taskCoverage: TaskCoverage[]
  ): void {
    const result = this.checkCoverage(frMetadata, taskCoverage);
    
    if (result.unreceived_clauses.length > 0) {
      const unreceivedList = result.unreceived_clauses.join(', ');
      throw new Error(
        `需求覆盖度不足（${result.coverage_rate}%）：未覆盖的 FR: ${unreceivedList}`
      );
    }
  }

  /**
   * 新两维覆盖度检查（REQ-261005105032-3b02 FR-5 / FR-9）。
   *
   * ① UI 卡必须有原型锚点：缺 → 覆盖度 < 100% 并**点名该卡编号**；
   * ② 每条 D-x 至少被一处引用：未被引用 → **点名该 D-x** 且该维覆盖度下降。
   *    引用侧口径 = FR 明细 / 设计章节侧编号（`clauseRefs`）**并集**任务卡的
   *    `requirementRefs` / `decisionRefs`（`covers_decisions`）——钉死在 coverage-calculator
   *    的模块头，勿收窄。
   *
   * **不抛异常、不作门禁**：返回 `blocking: false` 的结果对象（与 `validateCoverage` 的
   * "抛错 = 拒绝"语义刻意区分开）——设计口径是"只降覆盖度并点名，不拒阶段转移"。
   *
   * @param input 分类 + 任务卡投影 + D-x 清单 + 引用侧编号
   */
  static checkPrototypeTraceability(
    input: PrototypeTraceabilityInput
  ): PrototypeTraceabilityResult {
    const anchorCoverage = calculatePrototypeAnchorCoverage(
      input.category,
      toPrototypeAnchorTasks(input.tasks)
    )
    const decisionCoverage = calculateDecisionReferenceCoverage({
      decisions: input.decisions ?? [],
      clauseRefs: input.clauseRefs ?? [],
      tasks: toDecisionReferencingTasks(input.tasks),
    })

    const anchorVerdict = this.dimensionVerdict(
      'prototype_anchors',
      anchorCoverage,
      ids => `UI 卡缺原型锚点，未覆盖：${ids}`,
      '原型锚点'
    )
    const decisionVerdict = this.dimensionVerdict(
      'decision_refs',
      decisionCoverage,
      ids => `裁定未被任何 FR 明细 / 任务卡引用：${ids}`,
      '裁定引用'
    )

    return {
      prototype_anchors: anchorVerdict,
      decision_refs: decisionVerdict,
      gaps: [...new Set([...anchorVerdict.gaps, ...decisionVerdict.gaps])].sort(),
      blocking: false,
    }
  }

  /** 组装单维裁决（消息里既有百分比又点名，照着补就能转绿）。 */
  private static dimensionVerdict(
    dimension: TraceabilityDimension,
    coverage: Coverage,
    describe: (ids: string) => string,
    label: string
  ): DimensionVerdict {
    if (coverage.uncovered.length === 0) {
      return { dimension, coverage, gaps: [] }
    }
    const ids = coverage.uncovered.join('、')
    return {
      dimension,
      coverage,
      gaps: [...coverage.uncovered],
      message: `${label}覆盖度不足（${coverage.rate}%）：${describe(ids)}`,
    }
  }

  /**
   * 便捷入口：直接给"引用侧编号 → 是否命中 D-x"的判定（会话侧/校验器复用同一口径）。
   *
   * 为什么单独暴露：`collectDecisionReferenceIds` 在 coverage-calculator 里，而调用方
   * （如 rtm-health / 门禁文案）常常已经有一份编号清单、只想问"这条 D-x 被引用了没"，
   * 不必自己构造完整 input。
   */
  static decisionReferenced(
    decisionId: string,
    input: Omit<DecisionReferenceInput, 'decisions'>
  ): boolean {
    return collectDecisionReferenceIds({ decisions: [], ...input }).has(decisionId)
  }
}
