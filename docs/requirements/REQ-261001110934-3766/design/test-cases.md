---
req: REQ-261001110934-3766
doc: test-cases
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10
---

# 测试策略 · 十六条断言怎么跑、看到什么算过（REQ-261001110934-3766）

> **TL;DR**：原则**修前必红、修后必绿**。分四层：domain 单测（语法/预算/切节）、
> 集成（归档闭环 / 注入兼容 / 工具预算）、脚本门禁（生成确定性 / 九类自检）、
> E2E（冷启动问答评分 + 看板页）。A1–A10 全部有对应命令与可判读输出。

## 断言与用例对照 `serves: FR-1, FR-5, FR-6, FR-7`

| 需求断言 | 测试 | 命令 | 通过条件 |
|---|---|---|---|
| A1 体积基线 | T0 | `python3 docs/requirements/REQ-261001110934-3766/evidence/volume-probe.py` | 与 `evidence/volume-probe-2026-10-01.txt` 逐行一致（骨架 4.21%、色 67、变量 35、类名 545） |
| A2 索引进预算 | T5 | `npx vitest run tests/kb-index-budget.test.ts` | 8,001 字符或 201 行 → 门禁拒绝并报实际值 |
| A3 冷启动可答 | T13 | `npx tsx scripts/kb-coldstart-probe.mts`（准备问答包） | 只给索引+代码地图，5 问答对 ≥4 |
| A4 归档即沉淀 | T8 | `npx vitest run tests/kb-archive-deposit.test.ts` | 归档后索引 +1 行且字段齐全；无 `index_entry` → 拒绝 |
| A5 检索有闸 | T10 | `npx vitest run tests/kb-tool-budget.test.ts` | `budgetChars=300` → `truncated=true` 且回指针、正文不入结果 |
| A6 会自我防腐 | T11、T12 | `npx tsx scripts/kb-probe.mts`（注入 5 类故障） | 每类故障退出码非零并指出 id/行号 |
| A7 零回归 | T9 | `npx vitest run tests/kb-inject-compat.test.ts` | 无 `docs/knowledge/` 时输入包**逐字节**等于改动前快照 |
| A8 架构可答 | T13 | 同上（4 个架构问题） | 答对 ≥3/4，且答案可指到具体路径 |
| A9 规范可执行 | T12 | `npx vitest run tests/kb-conventions-executable.test.ts` | 每条 `校验：` 目标存在且可跑；缺失 → 红 |
| A10 令牌可复现 | T6、T7 | `npx tsx scripts/kb-build.mts --check` | 首跑 diff 为空；加一色后 diff 恰为该色 |

## T1–T4 · domain 单测（纯函数，无 IO） `serves: FR-1, FR-2`

| 用例 | 输入 | 期望 |
|---|---|---|
| T1 行语法往返 | 合法行 / 缺 `→` / `one_liner` 带 `·` / 超 200 字符 | 合法行 ↔ 对象往返相等；非法行**报错并带行号**，不返回半成品 |
| T2 id 形态判定 | `kb-0007` / `kb-conventions-c-01` / `kb-x` / `kb-7` | 前两式解析到各自存储（`kb-<页面>-<锚点>`）；后两式判非法 |
| T3 `slugify` + 切节 | 标题 `## 颜色` / 重名标题 ×2 | 锚点稳定且去重；按 `##`/`###` 切出的节**只含该节**（不含兄弟节） |
| T4 预算判定 | 8,000 / 8,001 字符；200 / 201 行；`budgetChars=8001` | 边界值判过/判拒准确；超限**返回结构化溢出**而非静默裁剪 |

**修前必红**：T1–T4 在实现前以桩函数运行，全部失败（`kb-index-line`/`kb-budget` 模块不存在即 import 失败）；
实现后全绿——这是「修前必红」的最低标准。

## T5–T7 · 生成物与门禁（跑脚本，比对文件） `serves: FR-4, FR-10`

| 用例 | 步骤 | 期望 |
|---|---|---|
| T5 索引预算门禁 | 造 8,001 字符 INDEX → `kb-probe` | 非零退出 + `K1 索引预算` + 实际字符/行数 |
| T6 生成确定性 | 连跑两次 `kb-build --write` | 第二次 diff **完全为空**（含 `generated_at` 之外的稳定字段；时间戳不得进比对口径） |
| T7 漂移可发现 | 手改 `design-tokens.md` 一行 → `kb-build --check` | 非零退出并指出漂移文件与首个差异行 |
| T7b 新增色值 | 往 `src/client/styles/base.ts` 加 `#abcdef` → 重跑 `--check` | 差异**恰好**是该色所在行（证明确定性抽取，不是整页重排） |

## T8–T10 · 集成（用例 + 端口 + 工具） `serves: FR-3, FR-5, FR-6`

| 用例 | 步骤 | 期望 |
|---|---|---|
| T8 归档闭环 | 造一个 archived 需求 → 调 `executeSubmitArchive`（带 index_entry） | ① 归档记录写入；② `entries/kb-NNNN.md` 生成；③ INDEX 对应分节 +1 行；④ 重复调用 → 条目覆盖、索引行不重复（幂等） |
| T8b 无 index_entry | 同上但 `index_entry=''` | 代码级拒绝（既有错误码），且**索引零变化** |
| T9 注入兼容 | 夹具 A：无 `docs/knowledge/`；夹具 B：有索引 + `trimRequirementDoc=false`；夹具 C：有索引 + `true` | A：逐字节等于改动前快照；B：仅在末尾追加索引节，需求文档节仍为全文；C：需求文档节替换为 TL;DR + 指针，且标注 `truncated` 与指针路径 |
| T10 工具预算 | `budgetChars=300` / `=1500` / 无命中 / `limit=999` / 三选择器全空 | 300 → 只回指针 + `truncated=true`；1500 → 回正文且总字符 ≤1500；无命中 → `items=[]`+`hint`；`limit` 越界 → `REQBOARD_INVALID_INPUT` |

## T11–T12 · 自检九项逐条（K1–K9） `serves: FR-7, FR-9`

| 用例 | 造故障方式 | 期望 |
|---|---|---|
| T11a K2 解析 | 索引里插一行少 `→` | 非零 + 行号 + 原文 |
| T11b K4 死链 | 条目 `pointer` 指向不存在的文件/锚点 | 非零 + 条目 id + 目标 |
| T11c K5 孤儿 | 放一个 `entries/kb-0099.md` 不入索引 | 非零 + `kb-0099` |
| T11d K6 stale | 把 `expires` 改到过去 | 非零 + 条目 id + 日期 |
| T12 K8 规范可执行 | 删掉 `C-02` 引用的测试文件 | 非零 + `C-02` + 目标路径；恢复后转绿 |

**判读口径**：任一检查失败 → 进程退出码 1 + 人读一行摘要 + `--json` 结构化明细；**不允许**「警告放过」。

## T13 · E2E 与人工评分 `serves: FR-1, FR-6, FR-8`

问答包（固定，写死 9 题）与评分口径：

| 组 | 题 | 判据 |
|---|---|---|
| 冷启动 5 题 | ① 分几层、依赖方向 ② 五道人工门在哪 ③ 加一个新 Agent 工具的落点 ④ 客户端纯 npm 包为什么必须打进 bundle ⑤ 归档索引由谁写 | 答案与 `architecture.md`/`conventions.md` 一致；错答计 0；≥4 分才算过（A3） |
| 架构 4 题 | ① 四层边界叫什么 ② 依赖只许朝哪边 ③ 样式归属契约在哪条纪律 ④ 尺寸门禁限多少行 | 必须能指到具体路径；≥3 分才算过（A8） |

**基线对照**：同一问答包在改动前（只给 README + 4 篇架构 + 源码）也能答对，但**消耗字符数高一个量级**——
评分脚本记录两组读入字符数，写进验收材料（证明「同等正确率、显著更少 token」）。

**看板页 E2E**：`GET /dashboard/api/reqboard/kb` 返回页面清单 → 知识库页渲染 8 个分节 → 点条目可打开文件（复用 `open-doc`）。

## 门禁接入与回归 `serves: FR-7`

| 门禁点 | 命令 | 说明 |
|---|---|---|
| 单测 | `npx vitest run tests/kb-*.test.ts` | 新增 6 个测试文件 |
| 类型 | `pnpm typecheck` | 新增模块 0 错误 |
| 生成物 | `npx tsx scripts/kb-build.mts --check` | 漂移即阻断 |
| 自检 | `npx tsx scripts/kb-probe.mts` | 九项检查 |
| 层边界（既有） | `npx vitest run tests/layer-boundary.test.ts` | 新增 domain 文件不得越界 |
| 尺寸（既有） | 宿主单文件 ≤400 行 | 拆文件后复核 |

## 与验收材料的关系 `serves: FR-7`

验收时提交的证据 = ① `evidence/volume-probe-*.txt`（A1）② `kb-probe --json` 输出（A6/A9）
③ `kb-build --check` 输出（A10）④ 归档闭环测试输出（A4）⑤ 冷启动/架构问答评分表与两组读入字符数（A3/A8）
⑥ `vitest` 汇总（A2/A5/A7）。
