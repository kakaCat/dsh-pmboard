---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 后端（host 侧）设计（REQ-261005123641-3982）

> 本需求**不动客户端**：报错 toast、看板、工具渲染均无改动。改动全部落在插件 host 侧
> （`application/` + 调用点），故需交付本份端侧设计。

## 端口与适配器影响 `serves: FR-1, FR-2`

| 组件 | 影响 | 说明 |
|---|---|---|
| `DocRepository.workspaceRoot()/setWorkspaceRoot()`（`FileDocRepository.ts:30,43`） | **零签名变更** | 语义文档化降级为「缓存」；判定不得读它的当前值 |
| `TaskStore.repo.setWorkspaceRoot`（鸭子探测） | 零变更 | 与 docs 同时校正（同根纪律不变） |
| `WorkspaceRootTargets` / `UseCaseDeps` | 零变更 | 第 3 参是新增**可选**入参，不新增端口 |
| `workspaceRegistry`（宿主 workspace id） | **本次不引入** | 现象可由「记录自己的根」+ 校正解决；引入 id 需新端口 + 装配，收益不足（留待架构级改造时评估） |
| 台账（`RequirementStore`，`~/.dsh/...`） | 零变更 | 不改 schema、不加字段、不迁移（见 `data-model.md`） |

## 并发与执行时序 `serves: FR-1, FR-2`

- 校正动作是**进程内同步赋值**（`docs.setWorkspaceRoot`）：本调用「校正 → 写」之间无 await 屏障时不会被别的窗口插入。
  ⇒ 设计约束：**守卫校正与随后第一次写盘之间不得插入 await**（实施时按此顺序落代码）；
  跨 await 的写入点（如 `await docs.write`）在校正后立即发起，若期间单例被改，由该写入点**自己的守卫**再校正一次
  （每个写盘点都过一次守卫 = 现状的门禁要求，不变）。
- 已知残留竞态（**显式声明，不静默**）：两窗口的写入若真并发交错，后校正者获胜——
  但由于每个写盘点都在「校正后立刻写」，写入仍落在**自己记录的根**下；
  极端交错下的互踩属于「共享单例」架构的固有属性，本次不承诺消除（见 `architecture.md` 的「不做」）。

## 错误处理与可观测性 `serves: FR-2, FR-3`

| 面 | 处理 |
|---|---|
| 拒绝 | `Object.assign(new Error(...), { code })` 沿统一信封抛出（既有做法）；文案含**两个绝对路径** + 修复建议 |
| 留痕 | 既有 `[项目根] 本次写入根=<abs>` 评论口径保留；`used_project_root` / `usedProjectRoot` 取值改为「声明根」 |
| 诊断 | 不新增日志面；既有 `state/reqboard-capture-diag.log` 与 `captureDiag` 通道不变 |

## 性能与资源 `serves: FR-4`

- 每次守卫新增 1 次 `requirementStore.get(reqId)`（by-id 路径）与 1 次字符串归一 + 1 次 `setWorkspaceRoot`（仅值变时才赋值）。
  量级与既有「读记录」调用同阶，不引入新 I/O 模式、不缓存。
- `sameProjectRoot` 保持不注入 realpath（application 层禁 `node:`）；校正后两侧同源，realpath 需求消失。

## 装配与开关 `serves: FR-2, FR-3`

- 无新开关、无灰度：行为在**所有**路径上一致收紧，避免「有的窗口修了有的没修」。
- 回滚方式：还原两个函数体（纯代码回滚）。
