---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 接口设计（REQ-261005123641-3982）

> 本份只定接口形态与错误语义，数据契约见 `data-model.md`，用例见 `test-cases.md`。

## 内部函数签名（变更，加性） `serves: FR-1, FR-2, FR-4`

```typescript
// src/application/internal/support.ts（application 层，不 import node:，纯判定 + 端口调用）

/** 本次调用自己的根（调用窗口会话 cwd）。只用于「记录未声明根」的兜底，不参与真错配判定。 */
export interface WriteRootCaller {
  callerRoot?: string
}

export function ensureWritableProjectRoot(
  deps: WorkspaceRootTargets,
  record: { id?: string; workspaceRoot?: string } | undefined,   // ← 权威输入（按 REQ id 取到的记录）
  caller?: WriteRootCaller,                                      // ← 新增（可缺省，旧调用点逐字不变）
): string | undefined

export async function assertWritableRequirementProject(
  deps: UseCaseDeps,
  reqId: string | undefined,                                     // ← 由 REQ id 取记录，再走上面同一实现
  caller?: WriteRootCaller,                                      // ← 新增（可缺省）
): Promise<string | undefined>
```

**签名纪律**：函数名不变（t8 门禁 `GUARD_CALL` 正则与 `PROTECTED_WRITERS` 清单据此匹配），
第 3 参可缺省 ⇒ 既有 **12 处守卫调用点**（6 处 `ensureWritableProjectRoot` + 6 处 `assertWritableRequirementProject`，
`support.ts:360` 是后者的内部实现、不重复计）**逐字不变**即可继续编译与通过门禁。

## 判定顺序（唯一改动点，顺序即语义） `serves: FR-1, FR-2`

| # | 输入 | 动作 | 返回 / 错误 |
|---|---|---|---|
| 1 | `record.workspaceRoot` 非空、绝对、目录存在 | `applyRequirementWorkspaceRoot(deps, record)` 校正共享仓储 → 复核 | 返回归一后的声明根 |
| 2a | 非空但**非绝对路径**（`'.'` 等） | 不校正、不拒绝（application 层解析不了它指向哪） | 返回探针当前值（读不回 → `undefined`）——**变更记①** |
| 2b | 非空、绝对，但**不存在 / 不可读** | **不校正、不写**（读侧的降级语义不适用于写侧） | 抛 `REQBOARD_INVALID_WORKSPACE`（文案含该路径 + 修复建议） |
| 3 | 为空、`caller.callerRoot` 有值 | 校正到 `callerRoot`（`attributed=false`，回执/评论须标注） | 返回 `callerRoot` |
| 4 | 为空、无 `callerRoot` | 无从核验 → 不判（不谎报成功，也不误拒） | 返回 `undefined` |
| 5 | 校正后 `deps.docs.workspaceRoot()` 仍 ≠ 声明根 | 不写（仓储不支持 `setWorkspaceRoot` 或校正失效——最后防线） | 抛 `REQBOARD_PROJECT_ROOT_MISMATCH`（给两个绝对路径） |
| 6 | 校正后一致 | 放行 | 返回声明根 |

### 变更记

**① 2026-10-05 · 相对声明根由「拒绝」改为「不判」**（实施期裁决，用户在对话中选「宽容：非绝对 → 不判」）

- 原文：第 2 行把「非绝对 / 不存在 / 不可读」并列，一律 `REQBOARD_INVALID_WORKSPACE`。
- 实测问题：内存仓储（`tests/application/harness.ts` 的 `FakeDocs.workspaceRoot()` 返回 `'.'`）
  会把 create 立项用例打红；相对根在生产路径不出现（`process.cwd()` / 会话 cwd 恒为绝对）。
- 现口径：非绝对 → **不判**（返回探针当前值），与改动前逐字一致；绝对根仍走「存在性校验 → 校正 → 复核」。
- 影响面：只收窄第 2 行的触发条件；FR-2 的「写前校正 + 校正失效才拒」不变。

**与现状的唯一差异**：顺序 1 由「只核验」变成「先校正再核验」。原设计顾虑是「拿可能算错的声明去搬动写入」——
该顾虑由需求侧的根可信化（capture/create 已优先取实际工作区）与顺序 2 的存在性硬校验共同承担；
记录声明的根**非法**时一律拒绝，绝不搬动。

## 错误语义（收窄，码集合不变） `serves: FR-2, FR-3`

| 场景 | 码 / 表现 | 变化 |
|---|---|---|
| 共享单例当前值 ≠ 记录声明根（多窗口常态） | **不再报错**，静默校正后放行 | **本次修复的核心** |
| 记录声明的根非法 / 目录不存在 | `REQBOARD_INVALID_WORKSPACE` | 写侧新增显式判定（此前会先撞 MISMATCH 或写失败） |
| 校正不可用且将写往别处 | `REQBOARD_PROJECT_ROOT_MISMATCH`（两个绝对路径） | 语义收窄为「校正失效的最后防线」 |
| 记录未声明根 | 回落 `callerRoot`；无则 `undefined`（不判） | 不变 |

## 工具回执（对外形状不变） `serves: FR-3`

- 成功路径：`used_project_root` / `usedProjectRoot` 字段与形状**逐字不变**（取值来源由「单例当前值」改为「声明根」，
  正常情况下两者一致，回执内容对人而言无感）。
- `reqboard_capture` 顺序调整后：拒绝发生在 `create` 之前 ⇒ **台账零写入**，
  回执不再出现「Error 说未立项、台账里却有 REQ」的半截态；成功回执字段不变。

## 调用点清单（实施时逐点确认，不改行为形状） `serves: FR-4`

| 调用点 | 现状 | 改后 |
|---|---|---|
| `plan-landing.ts:123` | `ensureWritableProjectRoot(deps, req0)` | 不变（走新实现） |
| `CaptureRequirement.ts:300` | 在 ④create(:277) ⑤advance(:291) **之后** | **新增 ④ 之前的守卫**（FR-3）；`:300` 保留为回归护栏 |
| `CreateRequirement.ts:63`、`ReportTask.ts:85`、`SyncRequirementMarks.ts:44`、`verification-doc-writer.ts:44` | 同签名 | 不变（走新实现） |
| `rtm-yaml.ts:157`（一处覆盖十处 RTM 调用点） | `assertWritableRequirementProject(deps, reqId)` | 不变（走新实现） |
| `SubmitVerification.ts:286`、`AdvanceChain.ts:129`、`AmendTaskAcceptance.ts:78` | 同上 | 不变（走新实现） |
| `queue-access.ts:116,126`（`mutateQueue` / `createManyQueue` 两个收口点） | 同上 | 不变（走新实现） |
