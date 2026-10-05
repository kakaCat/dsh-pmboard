# t-561faa kb-probe 新增 K10 工程操作覆盖度门禁

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
kb-probe 新增 K10 工程操作覆盖度门禁

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
删掉一条 C-NN 条目与其索引行 → npx tsx scripts/kb-probe.mts 退出码 1 且输出含 K10 与缺失命令；补齐后 npx tsx scripts/kb-probe.mts 退出码 0

## 实施方案（implementation）
scripts/kb-probe.mts 新增 K10：调 t1 的 buildCoverage/findGaps/validateOperationEntry；判据=覆盖清单每项能在规范页找到条目（命令文本匹配）+ 每条 C-NN 四要素齐全 + operations.tsv 与当次扫描一致；失败→退出码 1（无警告放过），--json 输出 { check:'K10', ok:false, detail, where }。

## 上游产出摘要（dependsSummary）
- 定覆盖清单与四要素判定（纯函数）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T07:05:46.402Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

门禁多了一只眼睛：必跑动作漏进规范页会当场点名，且不会误伤既有 10 条纪律。

### 完成项

- kb-probe 新增 K10（覆盖度 + 四要素 + 清单漂移）
- 与 K1–K9 同批十项全过；K8/K10 按节分工不误伤
- 演练证明「删一条即红、补齐即绿」

### 改动文件

- `scripts/kb-probe.mts`
- `src/domain/knowledge/operations.ts`

### 下一步

t7 收尾演练（已完成，见 evidence）

---
