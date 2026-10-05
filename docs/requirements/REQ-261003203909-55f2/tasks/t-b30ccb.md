# t-b30ccb 契约：四段登记 + 模板键 + template 纯函数（SubtaskTemplate）·复核

> 需求：REQ-261003203909-55f2 dev/integrate/review/test 这个不满足所有内容，需要补充，你调研看看需要补充什么，你可以看所有session的内容来判断

## 在做什么
契约：四段登记 + 模板键 + template 纯函数（SubtaskTemplate）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-03T15:58:13.213Z，窗口 session-e48f706a-b51f-47a9-85c5-47b7e59bba48）

复核结论：通过。实现与设计逐条对齐，三处实施期调整（颜色随 t1 同落/不变量豁免/TC-3 五表）均留痕且方向符合设计意图

### 完成项

- 逐条核对 design/data-model.md §1：四段的标签/证据族/颜色族/验收模板与设计逐字一致
- §2 模板键 change-only/acceptance 落表正确；§4 五表 Record 类型强制成立
- validateTemplateRef/resolvePlanStages 契约符合 interfaces.md §2：结构化 verdict、优先级 stages>template>兜底、同给冲突拒绝
- 偏离 1：颜色登记随 t1 同落（Record 编译强制原子性），t2 剩余范围=用例+反向演练
- 偏离 2：不变量 1.1b 修订为显式豁免清单（acceptance=[verify] 与「必含 review」冲突，设计未预判；豁免理由入注释）
- 偏离 3：TC-3 六表改五表（SCOPE_RULE 属 t4 交付物），验收标准已修订留痕
- 验证：目标套件 24/24 绿、七关联套件失败=基线 7（全存量）、tsc 149=149 零新增

### 下一步

t1 测试段（t-b5f257）：跑父卡终态验收命令并贴输出

---
