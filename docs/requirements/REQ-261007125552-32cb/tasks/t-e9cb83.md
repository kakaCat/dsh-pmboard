# t-e9cb83 粒度门禁与 RTM 回归测试·复核

> 需求：REQ-261007125552-32cb 拆分粒度细化：接口级/组件级任务卡 + 设计先行

## 在做什么
粒度门禁与 RTM 回归测试·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007125552-32cb/design/` 逐条核对；`npx vitest run tests/plan-granularity.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T06:10:48.082Z，窗口 session-f7f16017-9ae4-4879-956c-13ff76316613）

复核结论：无偏离。TC-1~12 全覆盖且全绿，与设计 test-cases.md 逐条对上。

### 完成项

- TC-1~12 逐条核对 test-cases.md：全部落地且有绿证（清单节门 6 / 存量豁免 3 / 对照表 4 / 降级 3 / 接口数门 2 / 豁免 6 / 词法 7 / 软门 5 / RTM 一对多双侧 / 三入口 3 / 提示词档 2 / 模板探针 4）
- TC-9 双侧拆分落点：RTM 侧在 decompose-rtm-integration.test.ts、落库侧在 plan-granularity.test.ts（设计允许「并入或新文件」）
- 额外加锚 1 条：传输码登记断言（transportCodeOf 三码）

### 下一步

测试段：跑 t6 验收命令全套

---
