# t-8f8ced client toolviews 映射改从注册表派生·复核

> 需求：REQ-261007230908-5ccb reqboard 体检第四批治理设施（错误码注册表 + 双拼归一单源 + 收官盘点）

## 在做什么
client toolviews 映射改从注册表派生·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007230908-5ccb/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T15:53:21.407Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t4 复核完成：IF-5 派生形态与小写键保留均无偏离

### 完成项

- 对照 IF-5：大写码段 Object.fromEntries(REQBOARD_CODE_REGISTRY) 派生；小写码 9 键原样在场（invalid_transition/human_gate/system_gate/task_card_incomplete/artifact_not_confirmed/requirement_uncovered/design_orphan/prototype_placeholder/prototype_geometry_unverified）
- 派生方向核对：注册表纯数据零 import，client 打包安全（verify-client 已证）
- D-5 核对：改动仅数据源，无渲染/样式/交互差异（diff 只触及映射表构造）
- 结论：无偏离——依据 = IF-5 逐条在场 + 小写键齐全 + verify-client OK

### 下一步

测试段

---
