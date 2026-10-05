/**
 * CreateRequirement 用例（REQ-47939a t6）——从 host/agent-tools.ts 的 defineCreateTool / reqboard_create 工厂**逐字搬入**编排。
 *
 * 零行为变更：拒绝条件、错误码与消息文案与搬迁前一致；规则仍单点于 domain/。
 *
 * REQ-260924213231-b1c4 T-10（FR-7 / UC-4）：降级路径（弹框通道不可用、用户文字取值）补齐第四问——
 * `doc_location` 入参 → 台账 `docBasePath`；缺省/空串显式回落默认位置并在返回体 `defaults_used` 留痕；
 * 形态非法（绝对路径 / 含 `..`）→ `REQBOARD_INVALID_INPUT`，不静默改路径。
 *
 * @module dsh-pmboard/application/use-cases/CreateRequirement
 */
import type { UseCaseDeps } from '../ports.js'
import { isAbsolute } from 'node:path'
import { statSync } from 'node:fs'
import { syncRTMYaml } from '../internal/rtm-yaml.js'
import { taskStoreOf } from './queue-access.js'
import {
  asReqCategory,
  normalizeText,
  normalizeTitle,
} from '../../shared/protocol.js'
import { CAPTURE_QUESTION_IDS } from '../internal/capture-mapping.js'
import {
  agentIdFromExec,
  requireLiveDriver,
  requireDirectHuman,
  createRequirementDirect,
  resolveDocBasePath,
  ensureWritableProjectRoot,
} from '../internal/support.js'

export async function executeCreateRequirement(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
      const windowKey = agentIdFromExec(deps, exec)
      requireLiveDriver(deps, exec)
      requireDirectHuman(deps, exec)
      const a = (args ?? {}) as { title?: unknown; category?: unknown; summary?: unknown; reason?: unknown; prompt_difficulty?: unknown; doc_location?: unknown; workspace_root?: unknown }
      const title = normalizeTitle(a.title)
      const category = asReqCategory(a.category)
      const summary = normalizeText(a.summary, 'summary')
      const reason = normalizeText(a.reason, 'reason')
      const promptDifficulty = typeof a.prompt_difficulty === 'string' ? a.prompt_difficulty : 'standard'
      // 第四问（FR-7）：取值 + 回落标记；非法形态在写台账之前响亮失败（不静默改路径）。
      const doc = resolveDocBasePath(a.doc_location)
      // 第五问（FR-6 降级路径）：workspace_root 可选；缺省 = 会话 cwd（与 capture 弹框默认一致）。
      // REQ-261001203710-0fbf t3：与 capture 同一口径——「这个项目在哪」优先取**实际会写进去的工作区**，
      // 而不是插件启动目录（否则记录一出生就把项目根记成别的项目，下游「按记录自己的项目写」就写错）。
      const effectiveWorkspace = (deps.docs as { workspaceRoot?: () => unknown }).workspaceRoot?.()
      const sessionCwd = (exec?.agent?.session?.header?.cwd as string | undefined)
        ?? (typeof effectiveWorkspace === 'string' && effectiveWorkspace.length > 0 ? effectiveWorkspace : undefined)
        ?? process.cwd()
      const workspaceRoot = resolveManualWorkspaceRoot(a.workspace_root, sessionCwd)
      const req = await createRequirementDirect(deps, windowKey, {
        title,
        category,
        description: summary.length > 0 ? summary : title,
        reason,
        promptDifficulty,
        docBasePath: doc.docBasePath,
        workspaceRoot,
      })
      // RTM 触发点 1（REQ-260926140539-457b FR-2）：立项即落 rtm-lifecycle.yml 骨架（失败不阻断立项）
      // REQ-261001203710-0fbf t3 / FR-2：RTM 按工作区相对路径落盘，写前按记录自己的项目校正并核验
      ensureWritableProjectRoot(deps, req)
      await syncRTMYaml(deps, await taskStoreOf(deps).listByRequirement(req.id), req.id, 'create')
      const defaultsUsed: string[] = doc.usedDefault ? [CAPTURE_QUESTION_IDS.doc_location] : []
      if (a.workspace_root === undefined || (typeof a.workspace_root === 'string' && a.workspace_root.length === 0)) {
        defaultsUsed.push(CAPTURE_QUESTION_IDS.workspace)
      }
      return {
        success: true,
        requirement_id: req.id,
        title: req.title,
        category: req.category ?? category,
        status: req.status,
        // 与台账同源（createRequirementDirect 已把回落值写进记录）：返回值 / 台账 / 输入包三面一致。
        doc_location: req.docBasePath ?? doc.docBasePath,
        workspace_root: req.workspaceRoot ?? sessionCwd,
        defaults_used: defaultsUsed,
        note: doc.usedDefault
          ? `已直接立项（创建即立项）：REQ 已在看板 draft 泳道立即可见，本窗口已绑定。未提供 doc_location → 已回落默认文档位置 ${doc.docBasePath}（见 defaults_used，不静默猜）。工作区：${req.workspaceRoot ?? sessionCwd}。`
          : `已直接立项（创建即立项）：REQ 已在看板 draft 泳道立即可见，本窗口已绑定。文档位置：${doc.docBasePath}。工作区：${req.workspaceRoot ?? sessionCwd}。`,
        board_link: `/dashboard#pmboard?req=${req.id}`,
      }
    }

/**
 * reqboard_create 的 workspace_root 解析（FR-6 降级路径）：
 * undefined/空串 → 会话 cwd（与 capture 弹框默认一致，记 defaults_used）；
 * 非绝对路径或目录不存在 → REQBOARD_INVALID_WORKSPACE 响亮失败（不静默改路径）。
 */
function resolveManualWorkspaceRoot(raw: unknown, sessionCwd: string): string {
  if (raw === undefined || (typeof raw === 'string' && raw.trim().length === 0)) return sessionCwd
  const p = String(raw).trim()
  if (!isAbsolute(p)) {
    throw Object.assign(
      new Error(`workspace_root 必须是绝对路径（收到：${p}）——REQBOARD_INVALID_WORKSPACE`),
      { code: 'REQBOARD_INVALID_WORKSPACE' },
    )
  }
  try {
    if (!statSync(p).isDirectory()) {
      throw Object.assign(
        new Error(`workspace_root 指向的目录不存在：${p}——REQBOARD_INVALID_WORKSPACE`),
        { code: 'REQBOARD_INVALID_WORKSPACE' },
      )
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'REQBOARD_INVALID_WORKSPACE') throw err
    throw Object.assign(
      new Error(`workspace_root 指向的目录不存在或不可读：${p}——REQBOARD_INVALID_WORKSPACE`),
      { code: 'REQBOARD_INVALID_WORKSPACE' },
    )
  }
  return p
}
