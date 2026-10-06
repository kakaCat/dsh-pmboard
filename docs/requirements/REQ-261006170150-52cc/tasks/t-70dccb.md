# t-70dccb 等待位契约：清位回调与 notify 开关·测试

> 需求：REQ-261006170150-52cc 修复：弹框作答后不唤醒 agent（确认推进后静默停摆）

## 在做什么
等待位契约：清位回调与 notify 开关·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T09:28:37.850Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

跑两条 acceptance 命令：清位契约用例 5/5 绿退出码 0；layer-boundary 的 3 项红全部命中权威基线登记项，未新增越层 import。

### 完成项

- ① npx vitest run tests/awaiting-clear-notice.test.ts → 退出码 0，5/5 通过
- 四项断言逐条对上：真清位回调恰 1 次、notify:false 为 0 次、台账本非 awaiting 为 0 次、回调抛错不外溢且返回 cleared:true
- ② npx vitest run tests/layer-boundary.test.ts → 3 项红，逐条命中 docs/reviews/test-baseline.failures.txt 第 34-36 行（权威基线）
- 3 项红的涉事文件（application/gate、use-cases、http/routers、domain/checkpoint、domain/job-spec）均非本卡改动文件 ⇒ 未新增越层 import
- 相关回归面：dialog-inflight-stop 14/14、ask-confirm-pending 13/13、wake 系 21/21 全绿
- npx tsc --noEmit -p tsconfig.json → 退出码 0，error TS 0 条
- 全量基线差集（baseline:check）：新增 5 条，逐条落到别窗口的 WIP 文件（gate-request.ts 未跟踪、report-band/head.ts、knowledge/generate.ts），非本卡引入
- 顺序相关 1 条（report-shell）单跑 64/64 通过，判定为套件内污染

### 改动文件

- `tests/awaiting-clear-notice.test.ts`

### 下一步

父卡 t-b85f4e 收尾：子卡全 done 后关父卡

---
