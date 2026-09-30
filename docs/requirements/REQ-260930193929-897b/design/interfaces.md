---
serves: FR-1, FR-2
---

# 接口设计 · REQ-260930193929-897b <!-- serves: FR-1, FR-2 -->

> 一句话：对外协议零变更；内部新增一个收敛函数，读侧闸门在读盘前调用它。

## TL;DR <!-- serves: FR-1 -->

本需求**不改任何对外接口**（工具入参/返回、HTTP 路径与字段全部不动）。
变的是一处**内部接缝**：读盘类闸门在读取某需求的文档前，先调用需求级根校正函数。

## 对外协议：零变更 <!-- serves: FR-1 -->

| 协议面 | 是否变更 | 说明 |
|---|---|---|
| `reqboard_ask_confirm` 入参 | 否 | `target` / `kind` / `question` / `evidence` 等一律不动 |
| `reqboard_ask_confirm` 返回体 | 否 | 形状不变；修好后 `gate_failure` **不再出现**（内容变化，非结构变化） |
| 看板 HTTP 路由与字段 | 否 | `/dashboard/api/reqboard/...` 路径、请求体、响应体均不动 |
| 台账字段 | 否 | 不新增、不改名、不改语义 |
| `requirement.md` front-matter | 否 | 不新增 `design_exempt`（避免改动已确认产物；见下「为何不加豁免键」） |

## 内部接缝：新增的唯一收敛函数 <!-- serves: FR-1 -->

**位置**：`src/application/internal/support.ts`（与 `resolveWorkspaceRoot` / `syncWorkspaceRootForRequirement` 同文件，保证「解析口径」只有一处）。

**签名**：

```
applyRequirementWorkspaceRoot(deps: UseCaseDeps, requirement: { workspaceRoot?: string } | undefined): void
```

**语义**：

- `requirement.workspaceRoot` 为非空字符串 → 调 `applyWorkspaceRoot(deps, workspaceRoot)`，同时校正 `docs` 与 `queueRepo`（两者必须同根）。
- 否则 → **no-op**（保持调用前的根：会话 cwd 或构造时的 `process.cwd()`）。
- 不抛错：`setWorkspaceRoot` 缺失（内存假实现）由既有鸭子探测跳过。

**与既有函数的关系（不新造第二套解析）**：

```
resolveWorkspaceRoot(exec, req)              ← 纯函数：优先级链解析（不变）
        │
syncWorkspaceRootForRequirement(deps, exec, req)   ← 写侧入口（行为不变）
        │  内部委托
        ▼
applyRequirementWorkspaceRoot(deps, req)     ← 新增：需求级校正的唯一实现
        ▲
        │  读侧直接调用（无会话上下文也能用）
   7 处读侧调用点
```

要点：`syncWorkspaceRootForRequirement` 的现有实现里，`exec` 只用于「需求无 workspaceRoot 时回落到会话 cwd」，而**真正的校正动作只在需求有 workspaceRoot 时发生**。抽出的 `applyRequirementWorkspaceRoot` 恰好只承载这个动作，因此**写侧行为逐字不变**，`exec` 参数保留以兼容既有调用点。

**前置 / 后置条件**：

- 前置：调用方已持有 target 需求记录（7 处调用点都有）。
- 后置：`deps.docs.root === requirement.workspaceRoot`（当该字段非空）；同一用例内不得再回退到会话 cwd。
- 时序：必须在**任何读盘之前**调用（`checkDesignCompletenessGate` / `checkDesignDecompositionGate` 之前）。

## 数据契约：零变更 <!-- serves: FR-2 -->

| 契约 | 现状 | 本需求 |
|---|---|---|
| `RequirementRecord.workspaceRoot` | 已存在（REQ-260929210741-30ae FR-6），立项时选定 | 不动定义，只**新增读侧消费方** |
| `queue.json` 结构 | 既有 | 不动 |
| `docs/requirements/<REQ>/` 目录约定 | 既有 | 不动 |
| RTM yaml 落盘位置 | 跟随 `docs.workspaceRoot()` | 不动（但读侧根修好后，RTM 与会话根的错位现象会一并消失） |

**兼容规则**：

- 需求无 `workspaceRoot` → 行为与修复前逐字一致（存量/默认路径）。
- 无会话上下文（看板路由）→ 按需求记录解析，**不依赖**「最后一次会话残留的根」——这正是看板路径此前不确定的来源。

## 错误语义 <!-- serves: FR-2 -->

- 本函数**不产生新错误码**。
- 闸门原有的 `design_doc_incomplete` / `design_contains_decomposition` 文案与结构**一律不变**（需求文档边界已锁定）。
- 修好后预期变化：`design_doc_incomplete` 中「requirement.md 不存在」这条缺口**不再出现**；反向用例下**必须仍然出现**（这是「没有修成永久放行」的唯一证据）。

## 为何不加 `design_exempt` 豁免键 <!-- serves: FR-2 -->

`design_exempt` 只从 `requirement.md` 的 front-matter 读取，而该文档**已落章确认**。
改它会造成「已确认产物与磁盘事实漂移」，还得重交 + 重新确认。
故本设计**改为把 5 份设计文档全部落盘**（`data-model.md` / `use-cases.md` 写成有信息量的"负空间"声明），不为省两份文档去动已确认的根文档。
