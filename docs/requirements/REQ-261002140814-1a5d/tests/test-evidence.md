# 测试与验收证据（REQ-261002140814-1a5d）

> 采集时间：2026-10-02（本窗口实施，轻档）｜工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
> 口径：命令 + 输出摘要（可重跑复核）；**未验证的项如实标注**，不以"应该没问题"收尾。

## 1. 结论

| 条款 | 结论 | 主证据 |
|---|---|---|
| FR-1 回执无损 + 不说假成功 | 通过 | 新增 7 条用例全绿；把修复还原后 4 red / 3 passed |
| FR-2 留痕写入 `body` | 通过 | 用例断言 `body` 有文字、无 `text` 键；类型错误 TS2353 消失 |
| FR-3 回归 + 门禁补洞 | 通过（含 1 处显式留债 + 3 条既有失败） | 契约门禁 28 passed / 3 failed（3 条为既有映射缺失） |

## 2. 命令与输出摘要

| # | 命令 | 结果 | 说明 |
|---|---|---|---|
| E1 | `pnpm typecheck 2>&1 \| grep ClearPause` | 改前 6 条 → 改后 **0 条** | 全仓总错误数 194 → 188（其余为历史错误，不计） |
| E2 | `npx vitest run tests/clear-pause-lossless.test.ts` | **7 passed** | 新增用例：UC-1..5 + 2 条反向证伪 |
| E3 | 同上（把 `ClearPause.ts` 临时还原成旧实现） | **4 failed \| 3 passed** | 证伪：断言不是恒真（还原后 md5 逐字节复原） |
| E4 | `npx vitest run tests/output-contract.test.ts` | 28 passed \| 3 failed | 3 条失败为**既有**：TaskAdopt / Knowledge / Regenerate 缺 `RESPONSE_SOURCES` 映射 |
| E5 | `pnpm test`（全量） | 98 failed \| 3009 passed | 仓库存档基线为 106 failed \| 2807 passed ⇒ 不高于基线；失败清单里**不含**本需求新增用例文件 |
| E6 | `pnpm build` | 退出码 0；client 校验 OK | `dist/index.mjs` 已含条件展开 `...previousActivation !== void 0 ? { previous_activation } : {}`，且旧的 `result.previousActivation` 读法消失 |
| E7 | `git diff --stat -- src/application/use-cases/ClearPause.ts tests/output-contract.test.ts` + `git status --short -- tests/clear-pause-lossless.test.ts` | ClearPause.ts +47/-18；output-contract.test.ts +57；新文件 1 个 | 改动面 = 1 源文件 + 2 测试文件，无 schema、无客户端改动 |

## 3. 端到端（D7）**未验证**——如实标注

真实调用 `reqboard_clear_pause` 需要**重启宿主**载入新构建（当前运行中的 DSH 进程仍是旧模块）。本窗口不做重启（会中断正在进行的对话），故：

- 已用 E6 证明**构建产物形状正确**；
- 未做"活体"调用复核（避免在 armed 需求上解锁而中断自动续跑，也避免误判）。

复核路径（重启宿主后）：在任一 armed 需求上调 `reqboard_clear_pause` → 回执应含 `previous_activation`、**不再出现** `value is not lossless JSON`；看板阶段评论应能看到 `Dive 模式已解除锁定（reqboard_clear_pause）。之前状态：armed`。

## 4. 本需求发现但**不在边界内**的问题（登记，不修）

| # | 发现 | 位置 | 处置 |
|---|---|---|---|
| D-1 | `reqboard_ask_confirm` 非肯定项且用户未填意见时返回 `user_feedback: undefined` ⇒ 真实调用同样会被判 `value is not lossless JSON`，把人的"需要修改"答复变成硬错误 | `src/application/use-cases/AskConfirm.ts:312` | 在 `tests/output-contract.test.ts` 的 `UNDEFINED_VALUE_DEBT` 里**显式登记**（修好即强制摘牌，到期 2026-10-16）；建议另立需求 |
| D-2 | TaskAdopt / Knowledge / Regenerate 三个工具在契约测试里**没有响应源映射** ⇒ 门禁读不到它们的返回键（"门禁没看见"） | `tests/output-contract.test.ts` 的 `RESPONSE_SOURCES` | 既有失败，登记；建议另立需求补映射 |
| D-3 | 历史台账里用 `text` 键写的解锁评论仍不可见（读方只读 `body`） | 台账历史数据 | 需数据迁移或读侧回退（均属新决策），本需求明确不做 |

## 5. 任务 ↔ 测试覆盖（covers）

父卡：

- `covers: t-63e66a` t1 父卡｜回执契约四件套（无损 + 不说假成功）—— `tests/clear-pause-lossless.test.ts` UC-1/UC-2/UC-3 + E1 类型过滤
- `covers: t-a3ed75` t2 父卡｜留痕写 `body` —— 同文件 UC-5（`body` 非空、无 `text` 键）+ E1 类型过滤
- `covers: t-93f87b` t3 父卡｜回归用例与反向证伪 —— E2 全绿 + E3 退修必红
- `covers: t-f94bec` t4 父卡｜契约门禁补洞 —— E4（28 passed / 3 既有失败）+ 反向自检用例
- `covers: t-25c6a0` t5 父卡｜迁移兼容与端到端 —— E5 基线比对 + E6 构建 + E7 改动面

子卡（研发 / 联调 / 复核 / 测试四段）：

- `covers: t-2de888` t1·研发｜契约四件套落地 —— E1（本文件 0 条）+ E4 静态扫描
- `covers: t-8ed4c7` t1·联调｜工具壳与输出声明未改动 —— `tests/tools-schema.test.ts` 42 passed
- `covers: t-1fb71d` t1·复核｜对照 interfaces.md 的 C1/C2/C3 无偏离 —— E1 + E2
- `covers: t-17f7e1` t1·测试｜回执无损与失败语义 —— E2 + E3 + E5
- `covers: t-f7da89` t2·研发｜`text` → `body` —— E1（TS2353 消失）+ `grep text:` 无输出
- `covers: t-0f850a` t2·联调｜写入与看板渲染字段一致 —— UC-5 断言 + 渲染路径核对
- `covers: t-a067f3` t2·复核｜字段集合 ⊆ CommentRecord —— 同 UC-5 断言
- `covers: t-9c833b` t2·测试｜改名无连带影响 —— tools-schema 42 passed + status-lossless 2 passed
- `covers: t-cad1d0` t3·研发｜用例文件落盘（含 serves 头）—— E2
- `covers: t-60346d` t3·复核｜用例与 design/test-cases.md 逐条对应 —— E2
- `covers: t-15d558` t3·测试｜可重跑、双向可证伪 —— E2 + E3
- `covers: t-970c00` t4·研发｜删豁免 + 反向自检 —— E4
- `covers: t-df6e03` t4·复核｜留债登记可摘牌 —— E4 + 留债断言
- `covers: t-309f30` t4·测试｜契约门禁重跑 —— E4
- `covers: t-31a760` t5·研发｜证据文档落盘 —— 本文件
- `covers: t-e3878a` t5·复核｜证据链与 FR 对应、未验证如实声明 —— 本文件第 1-3 节
- `covers: t-45c97a` t5·测试｜基线 / 类型 / 构建 / 改动面四项 —— E5 + E1 + E6 + E7

> 例外：`t-2de888` 等研发段的**文件系统证据**同时由父卡汇报的 `files_changed` 提供（同一份实现，不重复造证据）。

## 6. 执行方式偏差（如实登记）

| 项 | 计划 | 实际 | 影响 |
|---|---|---|---|
| 落库任务 DAG | 计划文档 §2 写了依赖与批次（t3←t1,t2；t5←t2,t3,t4） | 提交计划时**漏带 `depends_on` 字段** ⇒ 落库 5 张父卡的 `dependsOn` 均为空 | 无功能影响（本窗口按计划文档的批次顺序人工执行：t1 → t2/t4 → t3 → t5）；但看板 DAG 不体现批次，已在验收材料中声明 |
