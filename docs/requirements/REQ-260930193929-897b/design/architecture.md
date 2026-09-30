---
serves: FR-1, FR-2
---

# 架构设计 · REQ-260930193929-897b <!-- serves: FR-1, FR-2 -->

> 一句话：给「读文档的闸门」接上需求级根解析，让同一条需求的读写同根。
> 读者：实施者 / 复核者。图一律 ASCII 字符画（svgbob 风格），禁 mermaid。

## TL;DR <!-- serves: FR-1 -->

`deps.docs` / `deps.queueRepo` 是插件级共享单例，根由用例入口按**会话 cwd** 校正。
写侧已经会用**需求 workspaceRoot** 再校正一次，读侧（两个闸门共 7 处）没有——于是读盘落到会话工作区，需求工作区里的文件被判「不存在」。

## 现状：根解析链 <!-- serves: FR-1 -->

```
   用例入口 agentIdFromExec
        │  syncWorkspaceRootFromExec(exec)      ← 会话 cwd = A
        ▼
   deps.docs.root = A        deps.queueRepo.root = A
        │
        ├── 写侧：SubmitArtifact / SubmitDesignArtifacts
        │        syncWorkspaceRootForRequirement(req)   ← 需求 workspaceRoot = B
        │        ⇒ root = B                                  ✔ 已正确（FR-6 先例）
        │
        └── 读侧：G2 完整性门（4 处） + 拆分内容硬门（3 处）
                 直接传 deps.docs
                 ⇒ root 仍 = A                                ✘【本需求补这里】
                        │
                        ▼
           docs.exists('docs/requirements/<REQ>/requirement.md')
           在 A 下探测 → 找不到 → 误报「requirement.md 不存在」
```

两种后果，方向相反：

- **完整性门误拦（fail-closed）**：文件在 B 上却报缺失 → 自动推进被拦，需求卡死在设计节点。
- **拆分内容硬门静默放行（fail-open）**：`docs.list(designDir)` 在 A 下返回空数组 → 扫描不到任何文档 → 门禁**无声通过**，本应拦住的任务表会溜进设计产物。

## 改动点：七处读侧调用点 <!-- serves: FR-1 -->

两个闸门共享同一根因、同一修法，故同一次接线。

| 闸门 | 调用点 | 触发路径 |
|---|---|---|
| 完整性门 | `application/use-cases/AskConfirm.ts:107` | 产物已确认 → 早返回如实报缺口 |
| 完整性门 | `application/internal/confirm-settle.ts:169` | 弹框肯定答复 → 自动推进（**事故路径**） |
| 完整性门 | `application/use-cases/ConfirmArtifact.ts:191` | `reqboard_confirm_artifact` |
| 完整性门 | `http/routers/requirements.ts:43` | 看板移动 / 看板确认后自动推进 |
| 拆分内容硬门 | `application/internal/confirm-settle.ts:101` | 弹框确认前扫描 `design/` |
| 拆分内容硬门 | `application/use-cases/ConfirmArtifact.ts:89` | 工具确认前扫描 `design/` |
| 拆分内容硬门 | `http/routers/requirements.ts:223` | 看板确认前扫描 `design/` |

**范围澄清（请人在确认门裁定）**：需求文档 FR-1 写的是「完整性门四个调用点」。
设计阶段发现同一根因还覆盖**拆分内容硬门**的 3 处（且它是 fail-open，比误拦更危险：会静默放行本应拦下的任务表）。
本设计**把 3 处一并纳入**，理由：同一根因、同一行修法、且只修一半会留下一个已知的静默漏洞。
若人认为应严格按 FR-1 执行、把拆分内容硬门另立，请在确认门提出，我按意见收窄。

## 为什么用「校正既有单例」而不是「新建 reader」 <!-- serves: FR-2 -->

考虑过按需求构造一个独立 reader（`docs.withRoot(B)`），避免动共享单例。**端口形状不允许**：

- `DocRepository` 端口只暴露 `workspaceRoot()` / `exists` / `read` / `write` / `stat` / `list`，**没有** `withRoot`、`clone` 或工厂方法。
- 唯一能改根的能力是 `setWorkspaceRoot(root)`，且 `applyWorkspaceRoot` 已是**鸭子探测**（缺失即跳过，兼容内存假实现）。
- 写侧 FR-6 已经走这条路并上线验证过，读侧对齐它才是单一口径。

因此本设计**复用同一收敛点**，不新造第二套解析——这正是 FR-2 的要求。

## 已知限制（明确不在本需求） <!-- serves: FR-2 -->

共享单例的根是**全局可变**的。同一进程内多个需求并发交替调用时，根可能互相覆盖（A 需求读到 B 需求的根）。

- 这是**既有架构性质**，写侧同样受影响，不是本缺陷引入的。
- 本需求只保证：**每个用例在自身读盘前把根校正到位**。
- 「多需求并发时安全切换根」属于架构改造，已列入需求文档边界不做；触发即按轻档单向升级信号停手，另立重档需求。

## 迁移与回滚 <!-- serves: FR-2 -->

- **无数据迁移**：不改任何持久化结构，不改台账字段，无回填。
- **无灰度开关**：改动是「读之前多校正一次根」，失败模式与现状等价（根没变则行为不变）。
- **回滚**：还原涉及的源文件即可，无数据风险、无残留状态。
- **兼容**：需求没有 `workspaceRoot`（存量/默认）→ 校正函数 no-op，行为与修复前逐字一致。
