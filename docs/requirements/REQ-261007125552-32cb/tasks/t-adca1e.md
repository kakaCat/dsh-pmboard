# t-adca1e 粒度门禁 wiring 与三入口挂载·复核

> 需求：REQ-261007125552-32cb 拆分粒度细化：接口级/组件级任务卡 + 设计先行

## 在做什么
粒度门禁 wiring 与三入口挂载·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007125552-32cb/design/` 逐条核对；`npx vitest run tests/plan-granularity.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T05:55:39.482Z，窗口 session-f7f16017-9ae4-4879-956c-13ff76316613）

复核结论：实现与设计一致；1 处有意偏差（landing 路径警告合并进既有 warning 字段）已记录理由。

### 完成项

- 对照 backend.md 逐条核对：三维判定流程 ✓、词法避让（接收卡 key）✓、生效口径 ✓、降级不静默 ✓、豁免理由进 warnings ✓、三入口挂载位置 ✓、返回体非空才给键 ✓
- 偏差 1 处（有意）：批准直落路径（landApprovedPlan）的粒度警告并入既有 warning 文本字段而非独立 granularity_warnings 键——理由：LandApprovedPlanResult 是内部返回结构（非工具返回体），加键要动类型与全部调用方；合并进 warning 同样满足「披露不静默」

### 下一步

测试段：跑 t3 验收命令全套

---
