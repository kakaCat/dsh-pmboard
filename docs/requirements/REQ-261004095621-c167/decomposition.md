---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 拆分计划（REQ-261004095621-c167）

## 目标与做法

**目标**：把「点模型选择器就消失」这件事**关账**——根因已定位为**已安装的 DSH 客户端内部包不一致**
（`ui-model-selection` 要 `primitives.MenuGroup`，同一 `app.asar` 内的 `ui-primitives` 旧构建没有该导出
→ 开菜单 React `#130` → 席位退役 → 控件空白），**不是本仓缺陷**。

**做法**：本仓只交付"可复核 + 可复用 + 不再犯"的三样东西，**不动运行时代码**：

1. **缺陷报告**（已落盘）：现象 / 复现 / 运行时证据 / 静态证据 / 三步取证法 / 重装修复指引。
2. **取证脚本**：把报告里的手工步骤固化成一条命令（提取 app.asar 内同名文件 → 与 npm 发布版逐符号对标）。
3. **知识沉淀**：知识层新增 1 条 `pitfall`——"DSH 席位静默退役 = 渲染崩溃"的判别法，
   外加项目说明书一节，供后来人一眼判"是本仓还是安装问题"。
4. **防呆回归**：确认既有 `$$typeof` 断言仍能拦住同类写法（已修的知识库图标就是同款）。

## 改动盘点

| 动作 | 路径 | 说明 |
|---|---|---|
| 新增 | `docs/requirements/REQ-261004095621-c167/evidence/dsh-model-seat-crash.md` | 缺陷报告（**已落盘**，本次仅复核可重放性） |
| 新增 | `docs/requirements/REQ-261004095621-c167/evidence/extract-asar.mjs` | 取证脚本：提取 + 符号对标，一条命令复现结论 |
| 新增 | `docs/knowledge/entries/kb-00XX.md` | pitfall 条目：席位静默退役判别法（三步） |
| 修改 | `docs/knowledge/INDEX.md` | 「坑」节追加一行指针 |
| 修改 | `docs/architecture/project-manual.md` | 新增一节：外部安装不一致的判别与取证 |
| 已改（开工前） | `src/client/page/register-knowledge.ts` + `tests/kb-client-page.test.ts` | 同款缺陷修复 + `$$typeof` 防呆断言（本需求起因之一） |
| **零改动** | 运行时代码 / 台账结构 / 宿主路由 / 配置 | FR-2 已撤销：无新接口、无新数据 |

## 任务表

| key | 标题 | phase | side | depends_on |
|---|---|---|---|---|
| t1 | 落知识层 pitfall 条目：席位静默退役判别法 | doc | doc | — |
| t2 | 落地可重放取证脚本 extract-asar.mjs 并回链报告 | doc | doc | — |
| t3 | 回归确认：防呆断言 + 反向演练 + 基线比对 | test | fullstack | t1, t2 |
| t4 | 项目说明书新增「外部安装一致性判别」一节 | doc | doc | t1 |

## 条款覆盖对照表

| 需求条款 | 条款要什么 | 接收任务 |
|---|---|---|
| FR-1 | 现象复核与归属判定（席位快照 + registrant + 三步取证） | t2, t3 |
| FR-2 | 客户端渲染异常取证通道 | —（**本轮不做**：前置假设被推翻，理由与重开条件见 requirement.md FR-2 节与 design/architecture.md） |
| FR-3 | 按归属修复或上报（本案例=DSH 侧 → 缺陷报告 + 修复/规避指引） | t2, t4 |
| FR-4 | 同类「异常即退役」写法审计与防呆断言 | t1, t3 |


## 不做的事（复述边界）

- 不用本仓注册项顶替 `conversation.input.model` 席位（遮蔽真因）；
- 不改 DSH 自带包（`app.asar` 内 `ui-*` 一律不动）；
- 不实施 FR-2 的客户端 tee / 宿主落盘通道（前置假设被推翻，重开条件见设计文档）。

## 验收与证据

- 判定口径见 `design/test-cases.md`（TC-1..TC-6 + 反向演练 + MAN-1..3）；
- 交付证据：报告路径、脚本输出、`pnpm kb:check` 结果、`tsc` 与 vitest 基线比对；
- 用户侧修复验证：重装 DSH 客户端后 `conversation.input.model` 的 `occupants[0].active === true`（连点 3 次）。
