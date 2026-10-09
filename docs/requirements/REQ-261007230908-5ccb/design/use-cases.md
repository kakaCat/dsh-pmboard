# 用例（REQ-261007230908-5ccb）

> 三条主角路径：维护者加码、agent 读 prompt、人做收官核对。
> 每条用例落到可执行的机械凭证。

## UC-1 维护者新增错误码 <!-- serves: FR-1, FR-2 -->

1. 某窗口在新用例里 `throw … code: 'REQBOARD_SOMETHING_NEW'`；
2. 下一次 `pnpm test`：T1 红，点名 `REQBOARD_SOMETHING_NEW` 未注册，给自助路径；
3. 维护者在注册表补条目（code + message + layer，按字典序插入）；
4. 重跑守卫绿——「发现新码」从「人想起来」提前到「下一次测试」。

反向：维护者删除一个码的所有产生点，注册表残留条目 → T1 ② 红，点名死条目。

## UC-2 agent 读 prompt 错误码清单 <!-- serves: FR-3, FR-5 -->

1. agent 调 OpenWindowTool 失败，拿到 `REQBOARD_OPEN_WINDOW_FAILED`；
2. 回看 prompt 的错误码清单——**补全后**（G5/D-4）该码在列，附一句中文场景说明；
3. prompt 里任何码都不可能是幽灵码：T4 保证 prompt ⊆ 注册表 ⊆ 实现。

## UC-3 计划提交的双拼字段 <!-- serves: FR-4 -->

1. agent 提交计划，tasks[] 里混写 `dep_reasons`（snake 数组）与 `granularityExempt`（camel）；
2. protocol.ts 归一与 plan-granularity 门禁走**同一个** dual-field 实现读取；
3. 行为与今日逐字一致（data-model.md 语义表）；改归一逻辑只改一处，
   4 个读取点不可能再漂移（T8 grep 归零守住）。

## UC-4 体检收官核对 <!-- serves: FR-5 -->

1. 验收人打开 `docs/requirements/REQ-261007230908-5ccb/closure-audit.md`；
2. §4.3 十项 G 逐行：G1/G2/G3/G6/G7/G8/G9 → REQ-261007200706-89b7（已验收）；
   工具精简 → REQ-261007220012-bd29；G4 → 本批 FR-1/FR-2/FR-3；G10 → FR-4；G5 → FR-3/FR-5；
3. 每行「核验」列给出命令或链接，验收单逐项打勾，体检报告正式收官。
