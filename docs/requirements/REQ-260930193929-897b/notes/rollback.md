# 回滚说明 · REQ-260930193929-897b

> 一句话：本次改动是**纯读路径的根校正**，无数据迁移、无协议变更、无残留状态；
> 回滚 = 按清单反向编辑 6 个文件，跑两条命令确认。
>
> ⚠️ **不要用 `git checkout -- <file>` 回滚**：这 5 个源文件在本需求**之前**就已经带着
> 其他未提交的改动（本仓当前工作区有大量在途修改）。`git checkout` 会把那些改动一并丢掉。
> 请按下面的反向编辑逐条撤销。

## 回滚清单

| # | 文件 | 要撤销的内容 |
|---|------|--------------|
| 1 | `src/application/internal/support.ts` | 删除 `WorkspaceRootTargets` 接口与 `applyRequirementWorkspaceRoot` 函数；把 `syncWorkspaceRootForRequirement` 恢复为内联实现（含形参名 `exec` 与 `resolveWorkspaceRoot` 守卫） |
| 2 | `src/application/use-cases/AskConfirm.ts` | 删除 `applyRequirementWorkspaceRoot` 的 import 与其在早返回分支的调用 |
| 3 | `src/application/internal/confirm-settle.ts` | 删除 import 与其两处调用（拆分内容硬门扫描前、完整性门自动推进前） |
| 4 | `src/application/use-cases/ConfirmArtifact.ts` | 删除 import 与其两处调用（工具确认前扫描、G2 自动推进前） |
| 5 | `src/http/routers/requirements.ts` | 删除 import 与其两处调用（看板 `g2CompletenessFailure`、看板确认前扫描） |
| 6 | `tests/design-gate-workspace-root.test.ts` | 整文件删除 |

## 回滚步骤

1. 按上表撤销 1–5 的源文件改动（只删本次新增的 import / 接口 / 函数 / 调用行）。
2. 删除 `tests/design-gate-workspace-root.test.ts`。
3. 跑验证（见下）。

## 回滚后验证

| 命令 | 期望 |
|------|------|
| `node_modules/.bin/tsc --noEmit -p tsconfig.json` | 全量 **213** 条错误（本仓存量基线；本需求改动的文件零错误） |
| `node_modules/.bin/vitest run` | **103 failed / 2627 passed**（存量基线；回滚后不再有本需求新增的 13 例） |
| `grep -rn "applyRequirementWorkspaceRoot" src/ tests/` | 无输出（改动已完全撤销） |

## 为什么无数据迁移

```
   本需求只改变「去哪个目录读文档」               不改：台账 / queue.json / 文档格式 / 协议
   ────────────────────────────────            ─────────────────────────────────────
   deps.docs.root:  会话 cwd  →  需求 workspaceRoot      字段定义、文件布局、HTTP 形状一律不动
                                                          ⇒ 无回填、无灰度、无残留状态
```

回滚后行为与改动前**逐字一致**：需求没声明 `workspaceRoot` 时本来就是 no-op；
声明了的那些需求，会退回「可能被别的窗口的根影响」的旧行为——即本缺陷重现，但**不会损坏任何数据**。

## 已知残留（回滚也不会消除）

本需求执行期间留下的、与本改动无关的两处现场痕迹（已另行上报，回滚请勿一并删除，它们是证据）：

| 位置 | 内容 |
|------|------|
| `docs/requirements/REQ-260930193929-897b/notes/evidence-misplaced-decomposition.md` | 被写到错误工作区的机器生成清单（写入侧缺陷的物证） |
| `docs/requirements/REQ-260930193929-897b/queue.json` + `tasks/` | 本次从错误工作区搬回的任务存储与任务卡（写入侧缺陷的物证，也是本需求继续推进所必需） |
