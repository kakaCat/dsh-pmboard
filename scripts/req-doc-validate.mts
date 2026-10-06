/**
 * 文档自检（REQ-261005105032-3b02 t21 · FR-11 · design-brief §6 的「自检」行）——
 * **一条命令跑完 9 项文档判据**，让人（和 CI）不必分别去问七个门。
 *
 * ## 它解决什么问题
 * 判据此前散在各门禁的调用点里（`submit(requirement)` 的格式门、`design>decomposing` 的 G2 文档集、
 * plan 提交时的 design_orphan、实施收尾的 E2E/三级追溯、RTM 健康检查……），**没有任何一处能回答
 * 「这份需求文档全不全、合不合规」**。于是「红了也没人看」有了生存空间（REQ-292a 的门禁丢 9 天
 * 无人发现就是这个缺口的产物）。本脚本把判据收成一条命令：默认人读逐条 OK/FAIL，`--json` 供 CI 消费。
 *
 * ## 纪律：判据**全部 import 既有实现**，本文件只做「取数 + 组装 + 呈现」
 *
 * | # | 判据名 | 判据来源（**唯一实现**，本文件不重写） |
 * |---|---|---|
 * | 1 | 必填节 | `category-doc-sets.missingCategoryDocs`（BASE+DELTA 必填节 ∪ 必交设计文档 − 有效豁免） |
 * | 2 | front-matter | `category-doc-sets.frontmatterStateViolations`（逐条状态不许进 front-matter） |
 * | 3 | 格式门 | `content-gate-wiring.checkRequirementDocFormatGate`（根编号存在 / 连续 / 唯一） |
 * | 4 | 编号链 | `content-gate-wiring.checkNumberChainGate`（**悬空**硬拦；孤儿只标红，见下） |
 * | 5 | 追溯 | `content-gate-wiring.checkFullTraceability`（只判**需求 ← 设计**这一级，理由见下） |
 * | 6 | RTM 健康 | `rtm-health.checkRTMHealth`（缺文件 + 原型节适用性判据） |
 * | 7 | E2E 覆盖 | `content-gate-wiring.e2eCoverageOf`（→ `checkE2ECoverage`：测试策略表里有没有 E2E 行） |
 * | 8 | serves | `content-gate-wiring.checkDesignServesGate`（设计章节缺 serves 标注 = 孤儿章节） |
 * | 9 | dangling | `checkNumberChainGate` 的**悬空**读数（与 4 同源，单列——FR-11/D-9 的验收标准直接点名它） |
 *
 * 阶段时点清单**同源读** `domain/gate/GateCatalog.StageGateTimeline`（t13 交付的**唯一**时点表）：
 * 本脚本不另写一份「何时该绿」，只把 9 项判据按名字挂到该表的时点上去（`dueAt` 字段）。
 *
 * ## 三个刻意选择（每条都是"防假红/防两套真相"的直接后果）
 *
 * ① **读数不可得 = 不判**（`reading: 'unknown'`，**不计入缺口**）：与 `stage-gate-timeline` 的
 *   「阶段产物不在位不判」、各门对存量记录的 `isLegacy` 早退是同一纪律。把"我拿不到读数"当成
 *   "你没做"，只会制造假红并把真红淹没。**未知**在输出里明确写出来（打印 `OK（读数未知：…）`），
 *   不是悄悄放行——收口办法就写在那一行的原因里。
 * ② **同一读数在别处被判为阻断时，如实标注**（`conflictsWith`）：例如 E2E 覆盖在
 *   `assertStageGateTimelineGate`（实施收尾）里被判**逾期**，而在本脚本里"读数不可得"。
 *   两个口径不一致属既有事实（见 `notes/execution-decisions.md` 的登记纪律），本脚本**不掩盖**。
 * ③ **孤儿不是缺口**：`checkNumberChainGate` 自己的契约写得很清楚——「**不悬空**硬拦、**不孤儿**
 *   只标红。刻意不把孤儿做成硬拦——多写一份设计却暂时没有下游，是过程状态，不该锁死提交」。
 *   本脚本照抄该契约：孤儿进 `observations`（标红），只有**悬空**进 `gaps`。
 *
 * ## 退出码（与 `scripts/template-gate-probe.mts` 同款语义，决议 §10 #47）
 *   0 = 9 项判据全绿（含"读数不可得"的项）；1 = 有判据失败（缺口 > 0）；2 = **环境不可用**
 *   （参数错 / 定不了目标 / 需求文档不在盘上 / 读盘失败）——2 与 1 分开是因为处置完全不同。
 *
 * ## 目标需求怎么定（**默认口径与理由**）
 *   1. `--req <REQ-id>`：显式指定（**唯一确定性口径**，CI 与验收复核请用它）；
 *   2. 缺省：台账（`<DSH_HOME|~/.dsh>/reqboard/requirements/<REQ>/record.json`）里
 *      **热侧、状态 ∈ {implementing, accepting}、已登记产物（artifactCount > 0）**的需求中
 *      `updatedAt` 最新的一条；若这一档为空，回落到 `{design, decomposing}` 并如实标注（回落时
 *      设计文档可能仍在写，"未交"可能是时序假红）。
 *   3. 都没有 → exit 2 并给出"传 `--req`"的处置。
 *
 *   为什么不用「工作区里 requirement.md 最新的那份」：本仓同时有 5+ 条在飞需求，实测**最新的那条
 *   是别的窗口的 brainstorming 过程稿**（mtime 只是偶然结果），拿它当默认必红；而"已过需求门的
 *   实施/验收期需求"才是文档集**已冻结**、自检才有"该绿必须绿"意义的那一档（brainstorming 期是
 *   过程稿，判它"少节"就是拿时序状态当缺陷）。
 *
 * 用法：
 *   npx tsx scripts/req-doc-validate.mts                       # 人读；退出码 0/1/2
 *   npx tsx scripts/req-doc-validate.mts --req REQ-xxxxxx      # 指定目标（推荐）
 *   npx tsx scripts/req-doc-validate.mts --json                # stdout 只输出可 JSON.parse 的结构
 *   npx tsx scripts/req-doc-validate.mts --category feature     # 台账不可达时显式给类型（只影响判据 1）
 *   npx tsx scripts/req-doc-validate.mts --ledger-root <dir> --workspace <dir>
 *
 * 被 R1 复用（**并入 R1** 的落地形态）：`scripts/template-gate-probe.mts` import 本文件的
 * `validateDocSet()`，把每份需求类模板的**渲染产物**当合成文档集跑同一份判据集（不 spawn、不重写），
 * 于是 `pnpm templates:check` 一条命令同时覆盖「模板产物必过门禁」与「文档校验全套」。
 *
 * @module dsh-pmboard/scripts/req-doc-validate
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import {
  designDocPolicyFrom,
  frontmatterStateViolations,
  missingCategoryDocs,
  deltaFor,
} from '../src/application/internal/category-doc-sets.js'
import {
  checkDesignServesGate,
  checkFullTraceability,
  checkNumberChainGate,
  checkRequirementDocFormatGate,
  e2eCoverageOf,
  type DocsReader,
} from '../src/application/internal/content-gate-wiring.js'
import { parseDocument } from '../src/application/internal/content-gates.js'
import { checkRTMHealth } from '../src/application/internal/rtm-health.js'
import { StageGateTimeline, stageGateMomentFor } from '../src/domain/gate/GateCatalog.js'
import { REQ_TRANSITIONS } from '../src/domain/requirement/RequirementStatus.js'
import { isRequirementId, objectPath, recordPath } from '../src/domain/requirement/ReqboardPaths.js'
import { fmt } from '../src/domain/text/fmt.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

/* ── 9 项判据名（受控枚举：顺序 = design-brief §6 与 requirement.md FR-11 的字面顺序） ───────── */

export const DOC_VALIDATE_CRITERIA = [
  '必填节', 'front-matter', '格式门', '编号链', '追溯', 'RTM 健康', 'E2E 覆盖', 'serves', 'dangling',
] as const

export type DocValidateCriterion = (typeof DOC_VALIDATE_CRITERIA)[number]

/**
 * 判据名 → `StageGateTimeline` 里的门名（**别名表，不是第二份时点表**）。
 *
 * 为什么要别名：时点表里的门名是各门**自己的**门名（「无 dangling」「三级追溯」），而本脚本的 9 项
 * 判据名来自 requirement.md FR-11 的字面清单（「dangling」「追溯」）。只在这一处做名字对齐，
 * 时点与门名本身仍**只**从 `StageGateTimeline` 读——加一处硬编码的门名就等于长出第二份时点表。
 */
const TIMELINE_GATE_ALIAS: Partial<Record<DocValidateCriterion, string>> = {
  dangling: '无 dangling',
  追溯: '三级追溯',
}

/** 该判据在哪个阶段时点必须转绿（同源派生自 `StageGateTimeline`；不在时点表内 → undefined）。 */
export function dueAtOf(name: DocValidateCriterion): string | undefined {
  const gateName = TIMELINE_GATE_ALIAS[name] ?? name
  for (const [moment, gates] of Object.entries(StageGateTimeline)) {
    if (gates.includes(gateName)) return moment
  }
  return undefined
}

/* ── 报告结构 ───────────────────────────────────────────────────────────────── */

/** 判据读数：`judged` = 真判过；`unknown` = 读数不可得，**不判**（防假红，见模块头 ①）。 */
export type CriterionReading = 'judged' | 'unknown'

export interface CriterionResult {
  /** 判据名（9 项之一，受控枚举） */
  name: DocValidateCriterion
  /** 该判据是否通过（`reading === 'unknown'` 时恒 true——未知不是失败） */
  ok: boolean
  reading: CriterionReading
  /** 判据来源（既有实现的函数名——「没有第二份判据」在输出里可核） */
  source: string
  /** 阻断性缺口（非空 = 该判据失败） */
  gaps: string[]
  /** 不阻断的读数（孤儿标红 / 二三级读数 / 存量豁免如实报告） */
  observations: string[]
  /** 该判据必须转绿的阶段时点（同源 `StageGateTimeline`；不在时点表内 → 无此键） */
  dueAt?: string
  /** `reading === 'unknown'` 的原因与收口办法（必有） */
  unknownReason?: string
  /** 同一读数在别处被判为阻断时的如实标注（口径不一致不掩盖） */
  conflictsWith?: string[]
}

export interface DocValidateReport {
  script: 'req-doc-validate'
  target: {
    reqId: string
    /** 文档集标签（人读；合成文档集用它标明来源） */
    label: string
    category?: string
    status?: string
    createdAt?: number
    /** 目标是怎么定出来的（默认口径的可审计记录） */
    source: string
  }
  /** 9 项判据名（**顺序即呈现顺序**；`--json` 消费方据此断言"跑全了"） */
  criteriaNames: readonly DocValidateCriterion[]
  criteria: CriterionResult[]
  /** 缺口总数（= 全部判据 gaps 之和；`unknown` 不进这个数） */
  gapCount: number
  judgedCount: number
  unknownCount: number
  status: 'PASS' | 'FAIL'
  exitCode: 0 | 1 | 2
  /** 阶段时点清单（**原样读** `StageGateTimeline`，附本需求下一转移所在时点） */
  stageTimeline: {
    moments: Readonly<Record<string, readonly string[]>>
    /** 判据名 → 必须转绿的时点（同源派生） */
    dueAt: Record<string, string | undefined>
    /** 本需求下一转移落在哪个时点（读 `GATE_CATALOG` + `stageGateMomentFor`，**只报不判**） */
    nextTransition?: { from: string; to: string; moment: string; mustBeGreen: readonly string[] }
    /** 本 9 项覆盖不到的时点门（谁负责，写清楚——不许让人以为"自检全绿=所有门都绿"） */
    notCoveredByThisScript: string[]
  }
}

/* ── 输入（真实需求 / 合成文档集共用同一入口） ───────────────────────────────── */

export interface DocSetInput {
  reqId: string
  /** 文档集标签（默认 = reqId）——R1 用它标明"这份是渲染产物" */
  label?: string
  /** 立项类型（判据 1 的输入；缺 = 判不了必填节集，如实标未知） */
  category?: string
  /** 需求状态（判据 6 的输入之一：该状态该有哪些 RTM 文件） */
  status?: string
  /** 立项时间（判据 6 的输入之一：原型节适用性判据 `prototypeRulesSince`） */
  createdAt?: number
  /** 等价于台账上的 `artifacts` 非空（各门的 `isLegacy` 开关；false = 存量/直种记录，门自身早退） */
  hasArtifacts: boolean
  docs: DocsReader
  /** 设计文档清单（`docs.list` 不可用时由调用方显式给） */
  designNames?: readonly string[]
  /** RTM 健康所需的真实路径（虚拟/合成文档集不传 ⇒ 该判据读数不可得） */
  rtm?: { workspaceRoot: string; stateDir: string }
  /** 任务集（判据 5 的第二/三级读数用；不传 = 那两级读数不可得） */
  tasks?: readonly unknown[]
}

/**
 * 组一个**够用的** `RequirementRecord` 喂既有门。
 *
 * 为什么可以只填这些字段：本脚本消费的五个门只读 `id` / `category` / `status` / `createdAt` 与
 * **`artifacts` 是否为空**（`isLegacy` 开关）——多填的字段没有判据在读，填了反而会让人误以为
 * 它们在参与判定。与 `template-gate-probe.mts` 的 `as unknown as RequirementRecord` 同款做法。
 */
function asRequirementRecord(input: DocSetInput): RequirementRecord {
  return {
    id: input.reqId,
    title: input.label ?? input.reqId,
    description: '',
    ...(input.category !== undefined ? { category: input.category } : {}),
    status: input.status ?? 'implementing',
    blocked: false,
    createdAt: input.createdAt ?? 0,
    // 只有"是不是空"被读（空 = 存量 ⇒ 门自身早退），故这里给一个不承载语义的占位产物
    artifacts: input.hasArtifacts ? [{}] : [],
  } as unknown as RequirementRecord
}

/** 缺口取法（全脚本统一）：各门自己的 `gaps` 优先（逐条点名），没有再退回它的 `message`（整句）。 */
function gapsOf(failure: { gaps?: readonly string[]; message?: string } | undefined): string[] {
  if (failure === undefined) return []
  const gaps = failure.gaps ?? []
  if (gaps.length > 0) return [...gaps]
  return failure.message !== undefined && failure.message.length > 0 ? [failure.message] : []
}

/** 长清单点名（人读一屏）：前 5 条 + `等 N 个`——与 `assertFullTraceabilityGate` 同款口径。 */
function capList(items: readonly string[], lead: string): string {
  if (items.length <= 5) return lead + '：' + items.join('、')
  return lead + '：' + items.slice(0, 5).join('、') + fmt(' 等 {n} 个', { n: items.length })
}

/** 判据 7 的**读数可得性**：需求文档里有没有「层级」测试策略表（没有 = E2E 覆盖无判据对象）。 */
function testLevelTablePresent(rootText: string): boolean {
  return parseDocument(rootText).tables.some(t => t.header.some(h => h.includes('层级')))
}

/* ── 9 项判据 ───────────────────────────────────────────────────────────────── */

/**
 * 跑完 9 项判据（**不打印、不 exit**——打印与退出码由调用方决定）。
 *
 * 取数只在这里做一次（根文档 / 设计文档清单 / 设计章节 / 编号图），9 项判据各自只做"读 + 判"，
 * 免得同一份文档被 9 个判据各读一遍（IO 放大 9 倍，且容易读出不一致的快照）。
 */
export async function validateDocSet(input: DocSetInput): Promise<DocValidateReport> {
  const req = asRequirementRecord(input)
  const rootPath = 'docs/requirements/' + input.reqId + '/requirement.md'
  const designDir = 'docs/requirements/' + input.reqId + '/design'
  const rootExists = input.docs.exists(rootPath)
  const rootText = rootExists ? await input.docs.read(rootPath) : ''
  const rootDoc = rootExists ? parseDocument(rootText) : undefined
  const designNames = input.designNames !== undefined
    ? [...input.designNames]
    : (input.docs.list?.(designDir) ?? []).map(e => e.name ?? '').filter(n => n.length > 0).sort()
  const sides = rootDoc === undefined ? [] : designDocPolicyFrom(rootDoc.frontmatter).sides
  const results: CriterionResult[] = []

  /* ① 必填节 ─────────────────────────────────────────────────────────────── */
  if (!rootExists || input.category === undefined || deltaFor(input.category) === undefined) {
    results.push({
      name: '必填节',
      ok: true,
      reading: 'unknown',
      source: 'missingCategoryDocs',
      gaps: [],
      observations: [],
      ...(dueAtOf('必填节') !== undefined ? { dueAt: dueAtOf('必填节') as string } : {}),
      unknownReason: !rootExists
        ? '需求文档不在盘上（' + rootPath + '）⇒ 判不了必填节'
        : '立项类型未知（' + String(input.category) + '）⇒ 判不了该类型的必填节集：传 --category，或让台账记录可达',
    })
  } else {
    const gaps = missingCategoryDocs({
      category: input.category,
      rootExists: true,
      rootText,
      designNames,
      sides,
      ...(rootDoc !== undefined ? { exempt: designDocPolicyFrom(rootDoc.frontmatter).exempt } : {}),
    })
    results.push({
      name: '必填节',
      ok: gaps.length === 0,
      reading: 'judged',
      source: 'missingCategoryDocs',
      gaps,
      observations: [
        fmt('文档集口径：BASE + DELTA[{category}] 必填节 ∪ 必交/条件必交设计文档 − 有效豁免；在盘设计文档 {n} 份（{list}）', {
          category: input.category, n: designNames.length, list: designNames.join('、'),
        }),
      ],
      ...(dueAtOf('必填节') !== undefined ? { dueAt: dueAtOf('必填节') as string } : {}),
    })
  }

  /* ② front-matter ───────────────────────────────────────────────────────── */
  {
    const fm = rootDoc?.frontmatter ?? {}
    const gaps = frontmatterStateViolations(fm)
    const observations: string[] = []
    if (rootExists && Object.keys(fm).length === 0) {
      // 没有 front-matter 本身不是任何门的判据（故只报不判）；但它有一个**静默后果**必须说清：
      // sides 读不出 ⇒ 条件必交/原型适用性一律按"非 UI 需求"处理（REQ-292a 的事故形态之一）。
      observations.push('requirement.md 没有 front-matter 块：sides 读不出 ⇒ 条件必交（frontend/backend 设计文档、原型）会按"非 UI 需求"静默跳过')
    }
    results.push({
      name: 'front-matter',
      ok: gaps.length === 0,
      reading: 'judged',
      source: 'frontmatterStateViolations',
      gaps: gaps.map(k => fmt('front-matter 里出现逐条状态键「{key}」（逐条状态只能存表格行，两处都写必然漂移）', { key: k })),
      observations,
    })
  }

  /* ③ 格式门 ─────────────────────────────────────────────────────────────── */
  if (!input.hasArtifacts) {
    results.push({
      name: '格式门',
      ok: true,
      reading: 'unknown',
      source: 'checkRequirementDocFormatGate',
      gaps: [],
      observations: [],
      ...(dueAtOf('格式门') !== undefined ? { dueAt: dueAtOf('格式门') as string } : {}),
      unknownReason: '台账上该需求没有任何已登记产物（artifacts 空）⇒ 既有门自身按"存量/直种记录"早退，本项不判',
    })
  } else {
    const failure = await checkRequirementDocFormatGate(input.docs, req)
    results.push({
      name: '格式门',
      ok: failure === undefined,
      reading: 'judged',
      source: 'checkRequirementDocFormatGate',
      gaps: failure === undefined ? [] : [failure.code + '：' + gapsOf(failure).join('；')],
      observations: [],
      ...(dueAtOf('格式门') !== undefined ? { dueAt: dueAtOf('格式门') as string } : {}),
    })
  }

  /* ④ 编号链 ─────────────────────────────────────────────────────────────── */
  /* ⑨ dangling（同源单列）——两个判据吃同一份读数，故只算一次。 */
  if (!input.hasArtifacts) {
    const reason = '台账上该需求没有任何已登记产物（artifacts 空）⇒ 既有门自身按"存量/直种记录"早退，本项不判'
    for (const name of ['编号链', 'dangling'] as const) {
      results.push({
        name,
        ok: true,
        reading: 'unknown',
        source: name === '编号链' ? 'checkNumberChainGate' : 'checkNumberChainGate（悬空读数，与「编号链」同源）',
        gaps: [],
        observations: [],
        ...(dueAtOf(name) !== undefined ? { dueAt: dueAtOf(name) as string } : {}),
        unknownReason: reason,
      })
    }
  } else {
    const chain = await checkNumberChainGate(input.docs, req)
    const dangling = gapsOf(chain.failure)
    const orbitNote = chain.orphans.length === 0
      ? fmt('孤儿标红：0 个（编号图 {n} 个编号）', { n: chain.items.length })
      : fmt('孤儿标红（**不阻断**：多写一份设计却暂时没有下游是过程状态）：{list}', { list: chain.orphans.join('、') })
    results.push({
      name: '编号链',
      ok: dangling.length === 0,
      reading: 'judged',
      source: 'checkNumberChainGate',
      gaps: dangling.map(d => fmt('悬空引用：{edge}（serves 指向不存在的编号）', { edge: d })),
      observations: [orbitNote, fmt('编号图规模：{n} 个带编号条目（需求条款 + 设计章节）', { n: chain.items.length })],
      ...(dueAtOf('编号链') !== undefined ? { dueAt: dueAtOf('编号链') as string } : {}),
    })
    results.push({
      name: 'dangling',
      ok: dangling.length === 0,
      reading: 'judged',
      source: 'checkNumberChainGate（悬空读数，与「编号链」同源）',
      gaps: dangling.map(d => fmt('悬空引用：{edge}（serves 指向不存在的编号）', { edge: d })),
      observations: ['本项与「编号链」同源（`checkNumberChain` 的悬空读数），单列是因为 FR-11/D-9 的验收标准直接点名 dangling；孤儿不属本项'],
      ...(dueAtOf('dangling') !== undefined ? { dueAt: dueAtOf('dangling') as string } : {}),
    })
  }

  /* ⑤ 追溯（三级覆盖度；**只判需求 ← 设计**这一级）+ ⑧ serves 共享"设计内容是否可读"的读数 ── */
  const tasks = input.tasks ?? []
  const trace = await checkFullTraceability(input.docs, req, tasks)
  const designSectionsReadable = trace.implementationCoverage.total > 0
  const traceObservations: string[] = []
  // 第二级（设计 ← 任务）读数不可得：台账计划/任务卡上没有 `design_serves` 这个字段，而
  // `checkFullTraceability` 的第三级（任务 ← 测试）在它自己体内就是 TODO ⇒ 如实点名，不当缺口。
  traceObservations.push(
    '第二级（设计 ← 任务）读数不可得：任务集上无 `design_serves` 字段（' + String(tasks.length) + ' 个任务对象，覆盖 ' + String(trace.implementationCoverage.covered) + '/' + String(trace.implementationCoverage.total) + ' 个设计章节）——本脚本不用"我拿不到任务集"当"你没做"',
  )
  if (trace.implementationCoverage.gaps.length > 0) {
    traceObservations.push(capList(trace.implementationCoverage.gaps, '第二级点名（不阻断）'))
  }
  traceObservations.push('第三级（任务 ← 测试）在 `checkFullTraceability` 体内即为 TODO（`tested: 0`）⇒ 不具备判据资格，不当缺口')

  if (!rootExists || trace.designCoverage.total === 0) {
    results.push({
      name: '追溯',
      ok: true,
      reading: 'unknown',
      source: 'checkFullTraceability',
      gaps: [],
      observations: traceObservations,
      ...(dueAtOf('追溯') !== undefined ? { dueAt: dueAtOf('追溯') as string } : {}),
      unknownReason: !rootExists
        ? '需求文档不在盘上 ⇒ 追溯无起点'
        : '需求文档里没有可解析的根条款定义行 ⇒ 追溯无可判对象',
    })
  } else if (!designSectionsReadable) {
    results.push({
      name: '追溯',
      ok: true,
      reading: 'unknown',
      source: 'checkFullTraceability',
      gaps: [],
      observations: traceObservations,
      ...(dueAtOf('追溯') !== undefined ? { dueAt: dueAtOf('追溯') as string } : {}),
      unknownReason: '设计目录里读不到任何章节（' + designDir + '）⇒ 需求 ← 设计 这一级的读数不可得，不判（与 `stage-gate-timeline` 的"读数未知不判"同口径）',
    })
  } else {
    const gaps = trace.designCoverage.gaps.map(fr => fmt('{fr} 没有任何设计章节服务它（需求 ← 设计 这一级断了）', { fr }))
    results.push({
      name: '追溯',
      ok: gaps.length === 0,
      reading: 'judged',
      source: 'checkFullTraceability',
      gaps,
      observations: [
        fmt('需求 ← 设计：{covered}/{total} 条条款有设计章节承接（**只判这一级**：另两级读数不可得，见下）', {
          covered: trace.designCoverage.covered, total: trace.designCoverage.total,
        }),
        ...traceObservations,
      ],
      ...(dueAtOf('追溯') !== undefined ? { dueAt: dueAtOf('追溯') as string } : {}),
    })
  }

  /* ⑧ serves ─────────────────────────────────────────────────────────────── */
  if (!input.hasArtifacts || designNames.length === 0 || !designSectionsReadable) {
    results.push({
      name: 'serves',
      ok: true,
      reading: 'unknown',
      source: 'checkDesignServesGate',
      gaps: [],
      observations: [],
      ...(dueAtOf('serves') !== undefined ? { dueAt: dueAtOf('serves') as string } : {}),
      unknownReason: !input.hasArtifacts
        ? '台账上该需求没有任何已登记产物（artifacts 空）⇒ 既有门自身早退，本项不判'
        : designNames.length === 0
          ? '设计目录里没有 .md（' + designDir + '）⇒ serves 无判据对象'
          : '设计文档内容不在本次文档集里（读不到任何章节）⇒ serves 无判据对象',
    })
  } else {
    const failure = await checkDesignServesGate(input.docs, req)
    results.push({
      name: 'serves',
      ok: failure === undefined,
      reading: 'judged',
      source: 'checkDesignServesGate',
      gaps: gapsOf(failure),
      observations: [fmt('在判设计文档 {n} 份', { n: designNames.length })],
      ...(dueAtOf('serves') !== undefined ? { dueAt: dueAtOf('serves') as string } : {}),
    })
  }

  /* ⑥ RTM 健康 ───────────────────────────────────────────────────────────── */
  if (input.rtm === undefined || input.createdAt === undefined || input.status === undefined) {
    results.push({
      name: 'RTM 健康',
      ok: true,
      reading: 'unknown',
      source: 'checkRTMHealth',
      gaps: [],
      observations: [],
      unknownReason: input.rtm === undefined
        ? '本判据要读真实工作区与状态目录（RTM YAML 文件、失败记录）⇒ 合成/虚拟文档集读数不可得'
        : '台账记录不可达（缺 ' + (input.createdAt === undefined ? 'createdAt' : 'status') + '）⇒ 判不了"该状态该有哪些 RTM 文件"，不判',
    })
  } else {
    const health = checkRTMHealth(input.rtm.workspaceRoot, input.rtm.stateDir, req)
    const gaps = [
      ...health.missing_files.map(f => fmt('缺 RTM 文件：{file}（该状态 {status} 下应有）', { file: f, status: String(input.status) })),
      ...(health.gaps ?? []),
    ]
    const observations: string[] = []
    if (health.exempted !== undefined) {
      // 存量豁免（决议 #19）如实报告：不判不健康 ≠ 没有这一维
      observations.push('存量豁免（' + String(health.exempted) + '）：createdAt 早于原型规则上线日 ⇒ 原型节这一维不判、不追溯（如实报告）')
    }
    results.push({
      name: 'RTM 健康',
      ok: health.healthy && gaps.length === 0,
      reading: 'judged',
      source: 'checkRTMHealth',
      gaps,
      observations,
    })
  }

  /* ⑦ E2E 覆盖 ───────────────────────────────────────────────────────────── */
  {
    const e2e = await e2eCoverageOf(input.docs, req)
    // 读数可得性只由「文档在不在 + 有没有判据对象」决定，**不掺 `hasArtifacts`**：
    // `e2eCoverageOf` 自身没有 legacy 早退（它只读文档），在它上面再叠一层自有开关就是另立一份口径。
    const readable = rootExists && testLevelTablePresent(rootText)
    if (e2e === undefined || !readable) {
      /* 表述必须分成两种**真正不同的**原因（2026-10-05 t23 复核时发现旧写法会把第二种说成第一种）：
         ① 文档不在盘上 / 为空 ⇒ 连读都没有；
         ② 文档在盘上、但没有「层级」列测试策略表 ⇒ 读数未知（`e2eCoverageOf` 在 §4e 口径修正后
            对这种情况也返回 `undefined`；旧写法按 `e2e === undefined` 分支报"文档不在盘上"= 说错原因）。
         两种都"不判"，但收口办法完全不同（一个去落盘，一个去补表），故不许含糊。 */
      const docReadable = rootExists && rootText.trim().length > 0
      const reason = docReadable
        ? 'requirement.md 里没有「层级」列的测试策略表 ⇒ 本判据没有判据对象（不等于"没有 E2E 行"）'
        : '需求文档不在盘上 / 为空 ⇒ E2E 覆盖读数不可得'
      const conflicts: string[] = e2e === false
        ? ['同一读数（`hasE2E: false`）在 `assertStageGateTimelineGate` 的**实施收尾**时点被判为**逾期**（`stage_gate_overdue`）⇒ 本脚本标"读数不可得"，该门标"逾期"，两个口径不一致是既有事实，本脚本如实标注不掩盖；要收口须补「层级」测试策略表（模板面）或改该门口径']
        : []
      results.push({
        name: 'E2E 覆盖',
        ok: true,
        reading: 'unknown',
        source: 'e2eCoverageOf',
        gaps: [],
        observations: e2e === false ? ['读数内容：`checkE2ECoverage` 返回 hasE2E=false（无「层级」表时该值不承载"有没有 E2E 行"的语义）'] : [],
        ...(dueAtOf('E2E 覆盖') !== undefined ? { dueAt: dueAtOf('E2E 覆盖') as string } : {}),
        unknownReason: reason,
        ...(conflicts.length > 0 ? { conflictsWith: conflicts } : {}),
      })
    } else {
      results.push({
        name: 'E2E 覆盖',
        ok: e2e === true,
        reading: 'judged',
        source: 'e2eCoverageOf',
        gaps: e2e === true ? [] : [rootPath + ' 的测试策略表里没有「层级 = E2E」的行'],
        observations: [],
        ...(dueAtOf('E2E 覆盖') !== undefined ? { dueAt: dueAtOf('E2E 覆盖') as string } : {}),
      })
    }
  }

  /* ── 收尾：按 9 项顺序重排（判据内部的计算顺序不代表呈现顺序） ────────────────── */
  const byName = new Map(results.map(r => [r.name, r]))
  const ordered: CriterionResult[] = []
  for (const name of DOC_VALIDATE_CRITERIA) {
    const r = byName.get(name)
    if (r === undefined) throw new Error('内部错误：判据「' + name + '」没有产出读数（9 项必须各有一条）')
    ordered.push(r)
  }

  const gapCount = ordered.reduce((n, r) => n + r.gaps.length, 0)
  const unknownCount = ordered.filter(r => r.reading === 'unknown').length
  return {
    script: 'req-doc-validate',
    target: {
      reqId: input.reqId,
      label: input.label ?? input.reqId,
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
      source: input.label !== undefined ? '合成文档集（调用方给定）' : '命令行/台账',
    },
    criteriaNames: DOC_VALIDATE_CRITERIA,
    criteria: ordered,
    gapCount,
    judgedCount: ordered.length - unknownCount,
    unknownCount,
    status: gapCount === 0 ? 'PASS' : 'FAIL',
    exitCode: gapCount === 0 ? 0 : 1,
    stageTimeline: {
      moments: StageGateTimeline,
      dueAt: Object.fromEntries(DOC_VALIDATE_CRITERIA.map(n => [n, dueAtOf(n)])),
      ...(nextTransitionOf(input.status) !== undefined ? { nextTransition: nextTransitionOf(input.status) as NonNullable<ReturnType<typeof nextTransitionOf>> } : {}),
      notCoveredByThisScript: notCoveredByThisScript(),
    },
  }
}

/**
 * 本需求**下一转移**落在哪个时点（**只读** `REQ_TRANSITIONS`（状态机）+ `stageGateMomentFor`（时点表），
 * 只报不判）。
 *
 * 为什么走状态机而不是 `GATE_CATALOG`：`implementing → accepting`（= 时点「实施收尾」）**没有人工闸门**，
 * 拿闸门表当入口会整档漏判——这正是 `GateCatalog.ts` 里 `MOMENT_BY_TRANSITION` 那段注释记录过的坑，
 * 此处照同一口径取边（`StageGateTimeline` 的时点键与 `stageGateMomentFor` 仍是唯一来源）。
 */
function nextTransitionOf(status: string | undefined): DocValidateReport['stageTimeline']['nextTransition'] {
  if (status === undefined) return undefined
  const edges = (REQ_TRANSITIONS as Readonly<Record<string, readonly string[]>>)[status] ?? []
  for (const to of edges) {
    const moment = stageGateMomentFor(status, to)
    if (moment !== undefined) return { from: status, to, moment, mustBeGreen: StageGateTimeline[moment] ?? [] }
  }
  return undefined
}

/**
 * 本 9 项**覆盖不到**的时点门（如实列出，防"自检全绿 = 所有门都绿"的误读）。
 *
 * 为什么必须显式列：`StageGateTimeline.拆分落库` 的两道门（覆盖对照 FR→卡 / UI 卡原型锚点）由
 * `assertClauseCoverageGate` 在**拆分落库**时判，不在 FR-11 的 9 项清单里——不写出来，读的人会以为
 * 自检绿了就万事大吉（这正是"门禁红了没人看"的另一面）。
 */
function notCoveredByThisScript(): string[] {
  const covered = new Set(DOC_VALIDATE_CRITERIA.map(n => TIMELINE_GATE_ALIAS[n] ?? n))
  const out: string[] = []
  for (const [moment, gates] of Object.entries(StageGateTimeline)) {
    for (const g of gates) {
      if (!covered.has(g)) out.push(fmt('{moment} → {gate}（由该时点自身的门禁判，不在本 9 项内）', { moment, gate: g }))
    }
  }
  return out
}

/* ── 人读输出 ───────────────────────────────────────────────────────────────── */

const CRITERION_WHY: Readonly<Record<DocValidateCriterion, string>> = {
  必填节: 'BASE+DELTA 必填节 ∪ 必交/条件必交设计文档 − 有效豁免',
  'front-matter': '逐条状态不许进 front-matter（只放文档级索引）',
  格式门: '根编号存在 / 连续 / 唯一',
  编号链: '悬空硬拦；孤儿只标红',
  追溯: '需求 ← 设计（另两级读数不可得，见观察）',
  'RTM 健康': '该状态该有的 RTM 文件齐 + 原型节适用性',
  'E2E 覆盖': '测试策略表里有「层级 = E2E」的行',
  serves: '设计章节必须有 serves 标注',
  dangling: 'serves 不得指向不存在的编号（与「编号链」同源单列）',
}

export function printHuman(out: DocValidateReport, opts: { write?: (s: string) => void; writeErr?: (s: string) => void } = {}): void {
  const out_ = opts.write ?? ((s: string) => { console.log(s) })
  const err = opts.writeErr ?? ((s: string) => { console.error(s) })
  out_('文档自检（req-doc-validate · 9 项判据全部同源既有实现）')
  out_('目标：' + out.target.label
    + (out.target.category !== undefined ? '（' + out.target.category : '（类型未知')
    + (out.target.status !== undefined ? ' / ' + out.target.status + '）' : '）')
    + ' · 口径：' + out.target.source)
  DOC_VALIDATE_CRITERIA.forEach((name, i) => {
    const r = out.criteria[i]
    if (r === undefined) return
    const head = '  ' + String(i + 1) + '. [' + name + '] '
    if (r.reading === 'unknown') {
      out_(head + 'OK   （读数未知，不判：' + String(r.unknownReason) + '）')
    } else if (r.ok) {
      out_(head + 'OK   ' + r.source + '：' + CRITERION_WHY[name] + (r.dueAt !== undefined ? '（须绿于「' + r.dueAt + '」）' : ''))
    } else {
      err(head + 'FAIL ' + r.source + '：' + CRITERION_WHY[name])
      for (const g of r.gaps) err('       - ' + g)
    }
    for (const o of r.observations) out_('       观察 ' + o)
    for (const c of r.conflictsWith ?? []) out_('       ⚠ 口径不一致 ' + c)
  })
  out_('阶段门时序（同源读 domain/gate/GateCatalog.StageGateTimeline，本脚本不另写一份）：')
  for (const [moment, gates] of Object.entries(out.stageTimeline.moments)) {
    out_('  ' + moment + ' = ' + gates.join(' + '))
  }
  const nt = out.stageTimeline.nextTransition
  if (nt !== undefined) {
    out_('  本需求下一转移：' + nt.from + ' → ' + nt.to + '（时点「' + nt.moment + '」，该时点必须已转绿：' + nt.mustBeGreen.join(' + ') + '）')
  }
  for (const n of out.stageTimeline.notCoveredByThisScript) out_('  本 9 项覆盖不到：' + n)
  const line = '文档自检汇总：判据 9 项（实判 ' + String(out.judgedCount) + ' / 读数未知 ' + String(out.unknownCount)
    + '）；缺口 ' + String(out.gapCount) + '；exit ' + String(out.exitCode)
  if (out.gapCount === 0) out_(line)
  else err(line)
}

/* ── 台账读法（只在 CLI 侧用；判据本身零 IO 依赖） ─────────────────────────────── */

interface LedgerRecord {
  id: string
  category?: string
  status?: string
  createdAt?: number
  updatedAt?: number
  artifactCount?: number
  workspaceRoot?: string
}

/** 台账分片根：`<DSH_HOME|~/.dsh>/reqboard`（与 migrate/kb 脚本同款默认，可用 `--ledger-root` 覆盖）。 */
function defaultLedgerRoot(): string {
  const home = process.env['DSH_HOME'] ?? join(homedir(), '.dsh')
  return join(home, 'reqboard')
}

function readJsonIfExists<T>(path: string): T | undefined {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined
  } catch {
    return undefined
  }
}

/** 读一条需求的台账热记录（**分片路径走 `ReqboardPaths`**，不另拼一套路径）。 */
function readLedgerRecord(ledgerRoot: string, reqId: string): LedgerRecord | undefined {
  if (!isRequirementId(reqId)) return undefined
  return readJsonIfExists<LedgerRecord>(recordPath(ledgerRoot, reqId))
}

/** 台账里全部热侧记录（坏分片跳过——不因为一条坏记录让整次自检不可用）。 */
function listLedgerRecords(ledgerRoot: string): LedgerRecord[] {
  const dir = join(ledgerRoot, 'requirements')
  let names: string[]
  try {
    // readdirSync 在这里只为"列出候选"；读不回的记录会被 readJsonIfExists 吃掉（不因一条坏分片全盘不可用）
    names = existsSync(dir) ? [...readdirSync(dir)] : []
  } catch {
    return []
  }
  const out: LedgerRecord[] = []
  for (const name of names) {
    const rec = readLedgerRecord(ledgerRoot, name)
    if (rec !== undefined && typeof rec.id === 'string') out.push(rec)
  }
  return out
}

/** 默认口径的候选状态（见模块头「目标需求怎么定」的 ①②）。 */
const TARGET_STATUS_TIER1: readonly string[] = ['implementing', 'accepting']
const TARGET_STATUS_TIER2: readonly string[] = ['design', 'decomposing']

interface Target {
  reqId: string
  source: string
}

function pickTargetFromLedger(ledgerRoot: string): Target | undefined {
  const records = listLedgerRecords(ledgerRoot).filter(r => (r.artifactCount ?? 0) > 0)
  const tiers: readonly { statuses: readonly string[]; label: string }[] = [
    { statuses: TARGET_STATUS_TIER1, label: '台账·实施/验收期需求（文档集已冻结，最近更新）' },
    { statuses: TARGET_STATUS_TIER2, label: '台账·拆分/设计期需求（回落口径：设计文档可能仍在写，"未交"可能是时序假红）' },
  ]
  for (const tier of tiers) {
    const candidates = records
      .filter(r => tier.statuses.includes(r.status ?? ''))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    const top = candidates[0]
    if (top !== undefined) return { reqId: top.id, source: tier.label }
  }
  return undefined
}

/* ── 参数与入口 ─────────────────────────────────────────────────────────────── */

interface Args {
  json: boolean
  req?: string
  category?: string
  ledgerRoot: string
  workspace: string
}

const USAGE = [
  '文档自检（req-doc-validate）：一条命令跑完 9 项文档判据（必填节 / front-matter / 格式门 / 编号链 /',
  '追溯 / RTM 健康 / E2E 覆盖 / serves / dangling）。退出码：0 通过 / 1 判据失败 / 2 环境不可用。',
  '',
  '用法：',
  '  npx tsx scripts/req-doc-validate.mts [--req <REQ-id>] [--category <feature|bug|refactor|spike|doc|chore>]',
  '                                     [--workspace <dir>] [--ledger-root <dir>] [--json]',
  '',
  '目标缺省口径：台账里热侧、状态 ∈ {implementing, accepting}、已登记产物的需求中 updatedAt 最新的一条；',
  '为空则回落到 {design, decomposing} 并如实标注。要确定性口径请显式传 --req。',
].join('\n')

function parseArgs(argv: readonly string[]): Args | 'help' {
  const out: Args = { json: false, ledgerRoot: defaultLedgerRoot(), workspace: process.cwd() }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') return 'help'
    else if (a === '--json') out.json = true
    else if (a === '--req' || a === '--category' || a === '--ledger-root' || a === '--workspace') {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) throw new Error(a + ' 后面缺取值')
      i++
      if (a === '--req') out.req = next
      else if (a === '--category') out.category = next
      else if (a === '--ledger-root') out.ledgerRoot = resolve(next)
      else out.workspace = resolve(next)
    } else {
      throw new Error('未知参数：' + a)
    }
  }
  if (out.category !== undefined && deltaFor(out.category) === undefined) {
    throw new Error('--category 取值非法（不在既有 CATEGORY_DELTAS 里）：' + out.category)
  }
  return out
}

async function main(): Promise<void> {
  let args: Args | 'help'
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error('参数错误（exit 2）：' + String(e instanceof Error ? e.message : e) + '\n\n' + USAGE)
    process.exit(2)
  }
  if (args === 'help') {
    console.log(USAGE)
    process.exit(0)
  }

  /* 目标解析 */
  let target: Target
  if (args.req !== undefined) {
    if (!isRequirementId(args.req)) {
      console.error('环境不可用（exit 2）：--req 不是合法需求 id（期望 REQ-<12位时间戳>-<4位hex> 或 REQ-<6位hex>）：' + args.req)
      process.exit(2)
    }
    target = { reqId: args.req, source: '命令行 --req（确定性口径）' }
  } else {
    const picked = pickTargetFromLedger(args.ledgerRoot)
    if (picked === undefined) {
      console.error('环境不可用（exit 2）：定不了自检目标——台账里没有"热侧 + 已登记产物"的可判需求。\n'
        + '台账根：' + args.ledgerRoot + '\n处置：显式传 --req <REQ-id>（CI 与复核请一律用它）。')
      process.exit(2)
    }
    target = picked
  }

  const rootPath = 'docs/requirements/' + target.reqId + '/requirement.md'
  const docs = new FileDocRepository({ workspaceRoot: args.workspace })
  if (!docs.exists(rootPath)) {
    console.error('环境不可用（exit 2）：需求文档不在盘上：' + join(args.workspace, rootPath) + '（目标 ' + target.reqId + '，口径 ' + target.source + '）')
    process.exit(2)
  }

  const rec = readLedgerRecord(args.ledgerRoot, target.reqId)
  const category = args.category ?? rec?.category
  const status = rec?.status
  const createdAt = rec?.createdAt
  const hasArtifacts = (rec?.artifactCount ?? 0) > 0
  // 任务集：台账的拆分计划（`plan.json` 的 tasks[]）；它没有 `design_serves` 字段，故第二级只点名不判。
  // 分片路径仍走 `ReqboardPaths`（本文件不另拼一套路径——两套拼法迟早漂移）。
  const plan = isRequirementId(target.reqId)
    ? readJsonIfExists<{ tasks?: readonly unknown[] }>(objectPath(args.ledgerRoot, target.reqId, 'plan'))
    : undefined
  const tasks = plan?.tasks ?? []

  let report: DocValidateReport
  try {
    report = await validateDocSet({
      reqId: target.reqId,
      category,
      status,
      createdAt,
      hasArtifacts,
      docs,
      rtm: { workspaceRoot: args.workspace, stateDir: join(args.workspace, '.dsh-data/state') },
      tasks,
    })
    report = { ...report, target: { ...report.target, source: target.source } }
  } catch (e) {
    console.error('环境不可用（exit 2）：自检执行失败：' + String(e instanceof Error ? e.message : e))
    process.exit(2)
  }

  if (args.json) console.log(JSON.stringify(report, null, 2))
  else printHuman(report)
  process.exit(report.exitCode)
}

/** 只在"被直接执行"时跑 main（被 `template-gate-probe.mts` import 时不许自己 exit）。 */
const invokedDirectly = process.argv[1] !== undefined && /req-doc-validate\.(mts|ts|js|mjs)$/.test(process.argv[1])
if (invokedDirectly) await main()
