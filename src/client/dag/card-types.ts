/**
 * 队列 DAG 卡片四轴类型系统
 * 
 * 四根正交的轴决定卡片上的信息层次：
 * - Phase（任务类型，7 类）：决定类型徽标的颜色
 * - Side（端侧，4 类）：决定端侧徽标
 * - Role（角色，3 类）：决定是否显示父卡标识和子卡链进度
 * - Status（状态，6 类）：决定卡片背景色
 */

import { STAGE_KINDS } from '../../domain/task/SubtaskTemplate.js'

// ============ 枚举定义 ============

/**
 * Phase - 任务类型（7 类）
 * 决定类型徽标的颜色
 */
export enum Phase {
  /** 实施 - 主要开发任务 */
  IMPLEMENT = 'implement',
  /** 测试 - 测试任务 */
  TEST = 'test',
  /** 文档 - 文档编写 */
  DOC = 'doc',
  /** 评审 - 代码评审 */
  REVIEW = 'review',
  /** UI - 界面设计/实现 */
  UI = 'ui',
  /** 分析 - 需求分析/技术调研 */
  ANALYSIS = 'analysis',
  /** 合并 - 代码合并 */
  MERGE = 'merge'
}

/**
 * Side - 端侧（4 类）
 * 决定端侧徽标
 */
export enum Side {
  /** 后端 */
  BACKEND = 'backend',
  /** 前端 */
  FRONTEND = 'frontend',
  /** 全栈 */
  FULLSTACK = 'fullstack',
  /** 文档 */
  DOC = 'doc'
}

/**
 * Role - 角色（3 类）
 * 决定子卡链进度等派生语义（2026-09-29 裁定 D 后**不再有「左侧蓝条」这一视觉标识**）
 */
export enum Role {
  /** 父卡（名下可有子卡链；卡底进度由调用方 showKidChains 控制） */
  PARENT = 'parent',
  /** 子卡（不显示父卡标识） */
  CHILD = 'child',
  /** 独立卡 - 既非父卡也非子卡 */
  SOLO = 'solo'
}

/**
 * Status - 状态（6 类）
 * 决定卡片背景色
 */
export enum Status {
  /** 待开始 */
  TODO = 'todo',
  /** 开发中 */
  IN_PROGRESS = 'in_progress',
  /** 联调中 */
  INTEGRATING = 'integrating',
  /** 测试中 */
  TESTING = 'testing',
  /** 待复核 */
  IN_REVIEW = 'in_review',
  /** 已完成 */
  DONE = 'done'
}

// ============ 颜色映射表 ============

/**
 * Phase 类型徽标颜色映射（7 种彩色）
 */
export const PHASE_COLORS: Record<Phase, string> = {
  [Phase.IMPLEMENT]: '#0071e3',    // 蓝色 - 实施
  [Phase.TEST]: '#34c759',         // 绿色 - 测试
  [Phase.DOC]: '#ff9500',          // 橙色 - 文档
  [Phase.REVIEW]: '#af52de',       // 紫色 - 评审
  [Phase.UI]: '#ff2d55',           // 粉色 - UI
  [Phase.ANALYSIS]: '#5ac8fa',     // 青色 - 分析
  [Phase.MERGE]: '#ffcc00'         // 黄色 - 合并
};

/**
 * Side 端侧徽标颜色映射（4 种次要颜色）
 */
export const SIDE_COLORS: Record<Side, string> = {
  [Side.BACKEND]: '#8e8e93',       // 灰色
  [Side.FRONTEND]: '#007aff',      // 亮蓝
  [Side.FULLSTACK]: '#5856d6',     // 靛蓝
  [Side.DOC]: '#ff9500'            // 橙色
};

/**
 * 卡片所处阶段 key（与泳道列 key 同词汇）——着色与列归属共用同一套词表。
 */
export type TaskLaneKey = 'todo' | 'in_progress' | 'integrating' | 'testing' | 'in_review' | 'done';

/**
 * 单一阶段色：bg = 卡片底色（Canvas fillStyle 与 CSS background 通用），
 * fg = 阶段主色（列头色点 / 计数胶囊 / 状态文本共用）。
 */
export interface StageColor {
  bg: string;
  fg: string;
}

/**
 * 六阶段色板 —— **唯一事实源**（REQ-260930182521-4fee FR-1）。
 *
 * 取值 = 2026-09-24 用户裁定的泳道色（原 styles/node-panel.ts 卡片底色与列头色点硬编码值）。
 * Canvas（card-renderer.ts）与泳道 CSS（styles/node-panel.ts 模板插值）都必须从这里取色：
 * 任何一处另立色值，同一阶段就会在两个视图里显示成两种颜色（本需求的成因）。
 */
export const STAGE_COLORS: Record<TaskLaneKey, StageColor> = {
  todo: { bg: '#fafafa', fg: '#c7c7cc' },
  in_progress: { bg: 'rgba(0,113,227,.06)', fg: '#0071e3' },
  integrating: { bg: 'rgba(142,68,173,.07)', fg: '#8e44ad' },
  testing: { bg: 'rgba(255,149,0,.08)', fg: '#ff9500' },
  in_review: { bg: 'rgba(233,30,99,.06)', fg: '#e91e63' },
  done: { bg: 'rgba(52,199,89,.08)', fg: '#34c759' }
};

// ============ 类型定义 ============

/**
 * 卡片数据接口
 */
export interface CardData {
  /** 任务 ID */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务类型 */
  phase: Phase;
  /** 端侧 */
  side: Side;
  /** 角色 */
  role: Role;
  /** 状态 */
  status: Status;
  /** 依赖的任务 ID 列表（源数据；edges 是其展开结果） */
  dependsOn?: string[];
  /** 所在层级（用于布局；前驱 layer < 后继 layer） */
  layer?: number;
  /** 父卡 id（子卡专属；有值即为子卡） */
  parentId?: string;
  /** 子卡所属阶段（子卡专属；固定链是 dev/integrate/review/test，另有 repro/fix 等） */
  stageKind?: StageKind | string;
  /** 自足任务卡文档路径（有值 = 单击卡片可打开；2026-09-29 裁定 F 恢复旧分层列表的点击开文档） */
  cardDoc?: string;
  /**
   * 着色用阶段 key（= laneOf 推导的「卡片所处环节」，与泳道列 key 同词汇）。
   * 内存派生字段，不落队列/台账；缺省时消费方回落 {@link status}。
   */
  stageKey?: string;
  /** 父卡的子卡链（父卡专属，由 parentId 反查得到） */
  kids?: Array<{
    id?: string;
    stageKind?: StageKind | string;
    status: Status;
    title?: string;
  }>;
}

/**
 * 队列数据接口
 */
export interface QueueData {
  /** 任务列表 */
  tasks: CardData[];
  /** 分层结果（用于布局） */
  layers: string[][];
  /** 边线 */
  edges: Array<{
    from: string;
    to: string;
  }>;
}

// ============ 辅助函数 ============

/**
 * 获取类型徽标颜色
 */
export function getPhaseColor(phase: Phase): string {
  return PHASE_COLORS[phase] || '#8e8e93';
}

/**
 * 获取端侧徽标颜色
 */
export function getSideColor(side: Side): string {
  return SIDE_COLORS[side] || '#8e8e93';
}

/**
 * 获取状态背景色（阶段 key → 唯一色板；未知状态回落 todo 色）
 */
export function getStatusBackgroundColor(status: Status | string): string {
  return STAGE_COLORS[status as TaskLaneKey]?.bg ?? STAGE_COLORS.todo.bg;
}

/**
 * 获取状态文本颜色（阶段主色 fg；未知状态回落 todo 色）
 */
export function getStatusTextColor(status: Status | string): string {
  return STAGE_COLORS[status as TaskLaneKey]?.fg ?? STAGE_COLORS.todo.fg;
}

/**
 * 判断是否为父卡
 */
export function isParentCard(card: CardData): boolean {
  return card.role === Role.PARENT;
}

/**
 * 判断是否为子卡
 */
export function isChildCard(card: CardData): boolean {
  return card.role === Role.CHILD;
}


// ============ 阶段（子卡链）============

/**
 * StageKind - 子卡所属阶段。
 *
 * REQ-261003203909-55f2：改从 domain 的 STAGE_KINDS 派生（单一事实源）——此前本地硬编码
 * 4 段，2026-09 起 domain 已 16 段（本次 20 段），本地类型与排序表（下方 deriveTaskFields）
 * 都停留在四段时代，新段子卡全部落排序兜底位、链序显示错乱。
 */
export type StageKind = (typeof STAGE_KINDS)[number];

// ============ 四轴标签表 ============

/** phase 中文名（7 类） */
export const PHASE_LABEL: Record<string, string> = {
  implement: '实施',
  test: '测试',
  doc: '文档',
  review: '评审',
  ui: 'UI',
  analysis: '分析',
  merge: '合并'
};

/** side 中文名（4 类） */
export const SIDE_LABEL: Record<string, string> = {
  backend: '后端',
  frontend: '前端',
  fullstack: '全栈',
  doc: '文档'
};

/** status 中文名（6 类） */
export const STATUS_LABEL: Record<string, string> = {
  todo: '待开始',
  in_progress: '开发中',
  integrating: '联调中',
  testing: '测试中',
  in_review: '待复核',
  done: '已完成'
};

// ============ 派生字段 ============

/** 从 parentId / 子卡反查推断出的角色信息（内存计算，不写回 queue.json） */
export interface DerivedTaskFields {
  /** 角色：父卡（有子卡）/ 子卡（有 parentId）/ 独立卡 */
  role: Role;
  /** 父卡的子卡链（按 dev → integrate → review → test 排序） */
  kids?: Array<{ id: string; stageKind: StageKind | string; status: Status; title: string }>;
}

/**
 * 派生角色与子卡链。
 *
 * 规则（对齐设计 docs/design/data-model.md §派生字段）：
 * 1. 有 parentId → 子卡
 * 2. 否则反查 allTasks 里 parentId === task.id 的任务 → 有则父卡
 * 3. 都没有 → 独立卡
 */
export function deriveTaskFields(task: CardData, allTasks: CardData[]): DerivedTaskFields {
  if (task.parentId) return { role: Role.CHILD };

  const order: readonly string[] = STAGE_KINDS // 链序 = domain 枚举序（单点，新段自动跟随）
  const kids = allTasks
    .filter(function (t) { return t.parentId === task.id; })
    .sort(function (a, b) {
      const ia = order.indexOf(String(a.stageKind));
      const ib = order.indexOf(String(b.stageKind));
      return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
    })
    .map(function (t) {
      return {
        id: t.id,
        stageKind: (t.stageKind || '') as StageKind,
        status: t.status,
        title: t.title
      };
    });

  if (kids.length) return { role: Role.PARENT, kids: kids };
  return { role: Role.SOLO };
}
