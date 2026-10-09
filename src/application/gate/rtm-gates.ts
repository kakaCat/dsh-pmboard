/**
 * RTM 门禁三兄弟（设计门 / 拆分覆盖门 / 验收门）——**一份实现，三张规格**。
 *
 * REQ-261008020617-088f RF-2：这三份原先各写一遍 `fs.readFile(path.join(workspaceRoot, …))`，
 * 逻辑只差「查哪个字段」。同构克隆的代价不是行数，而是**同一处口径要改三遍**（漏一处就静默分叉）；
 * 合并后三兄弟之间的**全部差异**只剩一张 {@link RtmGateSpec}，读盘与错误兜底成为单点。
 *
 * ## 调用方纪律（读盘前必须先校正根）
 *
 * 本模块吃的是 `deps.docs`（宿主级单例，根会被别的窗口改掉）。调用前必须按
 * `docs/architecture/gate-read-root.md` 的唯一收敛入口 `applyRequirementWorkspaceRoot(deps, req)`
 * 把根校正到**被核验需求自己的项目**；否则同一份 rtm.yaml 会被读到别的会话工作区去
 * （实测后果两个方向都出过：完整性门误拦「文件不存在」，其余读类门静默放行）。
 *
 * ## 刻意保留的「不防御」
 *
 * `rtm.functional_requirements` 缺失时**不做 `?? []` 兜底**：畸形文件必须走进 catch 报
 * `rtm_not_found`，而不是被当成「一条 FR 都没有」静默判过。这是搬迁前的既有语义，逐字保留。
 *
 * @module dsh-pmboard/application/gate/rtm-gates
 */
import * as yaml from 'yaml'
import type { RequirementRecord } from '../../shared/protocol.js'
import type { DocRepository } from '../ports.js'

/** 门禁检查结果（三兄弟共享同一形状）。 */
export interface GateResult {
  /** 是否通过 */
  passed: boolean
  /** 错误代码（未通过时） */
  code?: string
  /** 缺口清单：未覆盖 / 缺引用的 FR id */
  gaps?: string[]
  /** 人类可读的消息 */
  message: string
}

/** RTM 文件中的功能需求条目。 */
interface FunctionalRequirement {
  id: string
  title?: string
  design_refs?: string[]
  task_refs?: string[]
  acceptance_status?: 'pending' | 'passed' | 'failed'
}

/** RTM 文件结构。 */
interface RTMData {
  functional_requirements: FunctionalRequirement[]
}

/** 一张门的规格——三兄弟之间的全部差异都在这里（改口径只改这一处）。 */
interface RtmGateSpec {
  /** 门名（进全部消息文案）。 */
  gateName: string
  /** 未通过时的错误码。 */
  code: string
  /** 通过时的一句话。 */
  passMessage: string
  /** 未通过消息里的缺口名词（如「功能需求缺少设计文档引用」）。 */
  gapNoun: string
  /** 缺口明细前的限定语（拆分门的「孤儿条款：」，其余为空串）。 */
  gapDetailLead: string
  /** 判定某个 FR 是否算缺口。 */
  isGap: (fr: FunctionalRequirement) => boolean
}

/** RTM 相对路径（工作区相对；根由 `docs` 端口决定）。 */
function rtmRelPath(reqId: string): string {
  return 'docs/requirements/' + reqId + '/rtm.yaml'
}

/**
 * 单点实现：读 RTM → 逐个 FR 判定 → 汇总缺口。
 *
 * 读不到 / 解析失败 → `code='rtm_not_found'`（消息里带原始错误），与搬迁前逐字一致。
 */
async function rtmGateCheck(spec: RtmGateSpec, req: RequirementRecord, docs: DocRepository): Promise<GateResult> {
  try {
    const rtmContent = await docs.read(rtmRelPath(req.id))
    const rtm: RTMData = yaml.parse(rtmContent)

    const gaps: string[] = []
    for (const fr of rtm.functional_requirements) {
      if (spec.isGap(fr)) gaps.push(fr.id)
    }

    if (gaps.length === 0) return { passed: true, message: spec.passMessage }
    return {
      passed: false,
      code: spec.code,
      gaps,
      message: spec.gateName + '未通过：' + String(gaps.length) + ' 个' + spec.gapNoun
        + '（' + spec.gapDetailLead + gaps.join(', ') + '）',
    }
  } catch (error) {
    // RTM 文件不存在 / 解析失败 / 结构畸形（见文件头「刻意保留的不防御」）
    return {
      passed: false,
      code: 'rtm_not_found',
      message: spec.gateName + '未通过：无法读取 RTM 文件（' + (error instanceof Error ? error.message : String(error)) + '）',
    }
  }
}

/** 设计门禁：所有 FR 必须有设计文档引用（REQ-260925212722-96e7 FR-4）。 */
export async function designGateCheck(req: RequirementRecord, docs: DocRepository): Promise<GateResult> {
  return rtmGateCheck({
    gateName: '设计门禁',
    code: 'design_incomplete',
    passMessage: '设计门禁通过：所有功能需求都有设计文档引用',
    gapNoun: '功能需求缺少设计文档引用',
    gapDetailLead: '',
    isGap: (fr) => !fr.design_refs || fr.design_refs.length === 0,
  }, req, docs)
}

/** 拆分门禁：所有 FR 必须有任务引用（REQ-260925212722-96e7 FR-5）。 */
export async function taskCoverageGateCheck(req: RequirementRecord, docs: DocRepository): Promise<GateResult> {
  return rtmGateCheck({
    gateName: '拆分门禁',
    code: 'task_coverage_incomplete',
    passMessage: '拆分门禁通过：所有功能需求都有任务引用',
    gapNoun: '功能需求未被任务覆盖',
    gapDetailLead: '孤儿条款：',
    isGap: (fr) => !fr.task_refs || fr.task_refs.length === 0,
  }, req, docs)
}

/** 验收门禁：所有 FR 的验收状态必须是 passed（REQ-260925212722-96e7 FR-6）。 */
export async function acceptanceGateCheck(req: RequirementRecord, docs: DocRepository): Promise<GateResult> {
  return rtmGateCheck({
    gateName: '验收门禁',
    code: 'acceptance_incomplete',
    passMessage: '验收门禁通过：所有功能需求都已通过验收',
    gapNoun: '功能需求未通过验收',
    gapDetailLead: '',
    // 未通过 = pending（待验收）或 failed（验收失败）——非 passed 一律记缺口
    isGap: (fr) => fr.acceptance_status !== 'passed',
  }, req, docs)
}
