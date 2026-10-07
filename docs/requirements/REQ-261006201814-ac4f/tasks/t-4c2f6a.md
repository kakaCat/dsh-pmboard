# t-4c2f6a 收口：核对零改动、给出改前改后读数与残留结论

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
收口：核对零改动、给出改前改后读数与残留结论

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：doc

## 得到什么结果

npx vitest run tests/compat-req-261006201814.test.ts 退出码 0；npx tsx tests/drill/compat-probe.mts 退出码 0（删除断言行数棘轮未抬高）并产出 docs/reviews/REQ-261006201814-ac4f-compat.json；npx tsx tests/drill/reverse-drill-error-codes.mts 退出码 0；docs/reviews/REQ-261006201814-ac4f-readings.md 在场且含改前/改后两组读数、工作树指纹、D-7 二选一结论与实施期偏差清单。原口径两条经实测不可达，已改判：①「git diff --name-only 中 src 前缀命中数为 0」不成立——实测 96 个 src 文件改动全部来自别的窗口（共享工作树），本需求红线改由「交付物清单里 0 个 src 路径」+ drill 如实并列读数来守；②「pnpm baseline:check 退出码 0」在共享工作树下会被别的窗口的在飞改动干扰，差集非空不等价于本需求引入，故读数列为如实报告项而非硬门。

## 实施方案（implementation）
新增 tests/compat-req-261006201814.test.ts：断言兼容三条——src 零改动（只读 git 命令统计 src 前缀命中数为 0）、既有测试文件 expect 删除数与 it 标题改写数均为 0、基线条目数不增加。产出 docs/reviews/REQ-261006201814-ac4f-readings.md：改前/改后两组读数（反向断言数与占比、零覆盖码数、假阴性率）并附同刻工作树指纹；D-7 结论（REQ-000001 与 REQ-000002 二选一处置与影响面）；第二版实施期发现的文档/实现偏差清单；另记一条：回退到 brainstorming 后重走流程会导致 DecomposeSpec 的回退口子够不着（rollbackTo 与最终状态永不相等），回退到 decomposing 才可重建。

## 上游产出摘要（dependsSummary）
- 让判据不能自称在判：改坏必须变红
- 把靠中文文案兜底的断言换成断错误码（上半）
- 把靠中文文案兜底的断言换成断错误码（下半）
- 越权、并发、空输入三张矩阵：每一格都钉死
- 把「不是本次引入」变成可复核的集合差

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T07:46:59.578Z，窗口 session-13fffcba-1baf-45ca-92dc-3cd382ee51c8）

u12 父卡收口：读数与偏差清单成文，收口期抓到的一例真回归已修复并复验

### 完成项

- 卡 u12 收口：核对零改动、给出改前改后读数与残留结论
- 兼容三条落地（tests/compat-req-261006201814.test.ts）与 git 读数入口（tests/drill/compat-probe.mts）；读数文件与 compat 产物成文
- 收口期抓到并修掉一例真回归（B-8）：⑤-a 沙箱最小开关集打红 26 条既有用例，A/B 实测 26 → 0；D-9（既有用例零语义变更）由此恢复
- 残留洞（B-9）记录在案并由 hermetic-guard 用例显式钉住，不静默
- 基线归因：新增失败由 35 降到 7，且 7 条在带沙箱 / 去沙箱两侧逐条相同（A/B 实测）⇒ 本需求 0 条，全部属别的窗口
- 读数齐全：R5 3.54%（下降，原因已写明）、零覆盖码 5、假阴性率 5.51%、基线条目 68 未增、删除断言行数 105 未抬高
- 残留结论逐条给出（零覆盖 5 / 基线红 68 / unknown 1 / 软失败回执无码 12 处 / REQ-000001 与 REQ-000002 处置建议）
- 待人工处置项：D-7 的 REQ-000001/2 去留（本需求只出二选一结论与影响面，不动手）

### 改动文件

- `tests/compat-req-261006201814.test.ts`
- `tests/drill/compat-probe.mts`
- `docs/reviews/REQ-261006201814-ac4f-readings.md`
- `docs/reviews/REQ-261006201814-ac4f-compat.json`
- `vitest.config.ts`
- `tests/hermetic-guard.test.ts`

### 下一步

需求交棒 accepting：reqboard_submit(kind=verification) 提交验收材料

---
