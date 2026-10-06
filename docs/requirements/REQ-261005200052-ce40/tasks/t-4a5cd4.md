# t-4a5cd4 诊断投影与四处文案：拒绝原文/回执/通知/状态只列真实出路·复核

> 需求：REQ-261005200052-ce40 拦截要讲清理由：REQBOARD_CONFIRM_PENDING 必须说清为何被拦、拦的是谁、哪条出路真的通

## 在做什么
诊断投影与四处文案：拒绝原文/回执/通知/状态只列真实出路·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-05T12:20:55.766Z，窗口 session-336d078f-ed9d-4b78-8359-0382bcad5763）

t3 复核段：四点同源、旧键未变；N4/N5 必红已跑；三处偏离如实登记。

### 完成项

- 四处消费点全部调用同一 facts 单点（assertNoPendingConfirm / ConfirmReceipt / QueryState / QueryReport），无第二份口径：grep 已核
- 旧键逐字未变已核：ticket / requirement_id / target / kind / created_at / interrupted / blocked_tools / recovery 语义不变，只追加五键
- StatusTool 的 pending_confirms 说明「非空即表示写路径会被拦」仍成立（livePendingConfirm 只会返回真拦得住的票）
- 逆验证 N5（通知无条件输出确认入口）真跑打红 1 例后逐字节还原
- 逆验证 N4（固定三条出路）真跑打红 3 例后逐字节还原（md5 81f1596aac4a87fd3c37b051b58f789e）
- 两处既有断言更新已核并说明理由：集成用例的固定文案常量补「可用出路」后缀（FR-3 契约变更，前缀仍精确断言），非放宽
- 与设计的三处偏离已如实登记：① 新增 isConfirmGateKind 内部助手（同单点重构，无行为变化）；② ② 也要求产物在册（看板确认同样要求，否则点了落不了章）；③ 增加 QueryReport 缺口文案为第 5 个消费点（口径一致）
- 其余无偏离；npx vitest run 四套件 61 例全绿 + npx tsc --noEmit 退出码 0

### 改动文件

- `src/application/internal/pending-guard.ts`
- `src/application/internal/support.ts`
- `src/application/internal/artifact-gates.ts`
- `src/application/query/QueryState.ts`
- `src/application/query/QueryReport.ts`
- `src/application/use-cases/ConfirmReceipt.ts`
- `src/tools/StatusTool/StatusTool.ts`
- `tests/pending-guard.test.ts`
- `tests/pending-guard-integration.test.ts`

### 下一步

父卡收口后开 t4（探针转正 + 六条逆验证 + 全量基线）。

---
