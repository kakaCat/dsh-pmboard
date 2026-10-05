# t-b6aa22 误物化能一次清掉：仅人的批量清理入口 + 可核对回执·复核

> 需求：REQ-261004121649-bfa7 回退把需求埋了：重做卡递归膨胀且没有撤销入口

## 在做什么
误物化能一次清掉：仅人的批量清理入口 + 可核对回执·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T08:51:39.420Z，窗口 session-51baeeda-dbe8-4048-8bc8-b036050d7957）

复核段：数字、幂等、不碰 done 三条与设计逐条对上；报了一处必须记账的偏离。这一步做完，什么变了——「仅人」这道门换成了本仓已证有效的做法（工具面不存在），设计文档里那句旧写法要跟着改，否则下一个人会照着一句做不到的验收去写用例。

### 完成项

- 无偏离（data-model §二）：rollback = { seq, lastAt, lastMaterialized } 三个字段全部落地——seq 与 lastMaterialized 为本轮新增；lastAt 的语义由既有的 at 字段承担（同一时刻，不另加重复字段，避免两处时间戳漂移）
- 无偏离（interfaces §三 数字）：回执含 canceled 与 restoredLinks 两个可核对数字
- 无偏离（interfaces §三 幂等）：同一次回退清两次 → 第二次 canceled === 0（用例断言）
- 无偏离（interfaces §三 不碰 done）：done 卡跳过并在回执里给原因（用例断言）
- **已知偏离（人工裁定 2026-10-04，须记账）**：interfaces §三 写「agent 调用返回 REQBOARD_HUMAN_GATE」，实现改为**不注册任何 agent 工具**——理由是 HTTP 调用方身份在服务端无法辨别，靠 body 自称等于把门锁在标签上；用户当面选定方案 A。设计文档该行停留在旧写法，属设计文档待同步项，不是实现缺陷
- 偏离（实现位置）：interfaces §一 的 materializeCount 字段未单发——调用方取 reworkDrafts.length（与 t1/t2 复核同一裁定）
- 自测：tests/rollback-cleanup.test.ts → 11 passed

### 下一步

测试段：跑目标用例并核对失败数不超过基线

---
