# t-ea39c8 进度接口补需求累计 token（与节点同源、缺失即不发）·复核

> 需求：REQ-261004143941-b2ca 会话右上角流程图 token 统计不展示：定位与修复

## 在做什么
进度接口补需求累计 token（与节点同源、缺失即不发）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T06:56:51.130Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

复核段完成：改动与设计逐条对得上（接口契约、同源口径、缺失语义、回归面），无行为偏离；顺带查明一条既有红用例与本需求无关并留档。

### 完成项

- 逐条对照 design/interfaces.md：字段可选、仅 > 0 输出、取值同源、错误语义未新增分支——全部符合
- 逐条对照 design/data-model.md：自洽性（总数 === 各节点之和）已在真数据上验证；缺失语义由用例锁住
- 回归面核查：nodeTokensOf 全仓只有唯一调用点，改签名无外溢；进度路由之外的代码零改动
- 发现一处既有红旗并留档：tests/routes-rollup.test.ts 两条用例在开工前就是红的——该文件用 createReqboardHandler({store, requirementStore, now}) 起路由，缺 v9 必需的 taskStore（src/application/use-cases/queue-access.ts:26 的「任务队列端口未装配」），与本次改动无关（该文件同时有 3 个既有类型错）
- 措辞层面一处不精确（不构成行为偏离）：design/data-model.md 写性能「不增反微降」，实际是装配次数前后都为 1 次，应表述为「不增」

---
