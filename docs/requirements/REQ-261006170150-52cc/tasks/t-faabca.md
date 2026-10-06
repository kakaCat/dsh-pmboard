# t-faabca 确认收敛点：带 ref 清位先于推进 + 补发条件·测试

> 需求：REQ-261006170150-52cc 修复：弹框作答后不唤醒 agent（确认推进后静默停摆）

## 在做什么
确认收敛点：带 ref 清位先于推进 + 补发条件·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T10:40:29.615Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

两条 acceptance 达标：新用例 7/7 绿、旧语义零回归 24/24 绿。

### 完成项

- ① npx vitest run tests/confirm-settle-order.test.ts → 退出码 0，7/7 通过
- 覆盖：写入序恰为 [stop-cleared, status-changed]（停手位先清、status 后变）
- 覆盖：推进成功补发 0 次 / 被内容门拦下 1 次 / reject 抛错 1 次
- 覆盖：第二票在场 ⇒ 清 A 后停手位保持 awaiting-confirm:B，清 B 才 healthy
- ② npx vitest run tests/ask-confirm-pending.test.ts tests/confirm-advance-deadlock.test.ts → 24/24 绿（旧语义零回归）
- 相关回归：confirm-settle-preconditions 5/5、dive-confirm-advance 5/5、dialog-inflight-stop 14/14、confirm-group 5/5、artifact-group-confirm 4/4
- npx tsc --noEmit：本卡文件 0 条错误（现存错误在别窗口文件）
- 基线在册既有红 1 条（confirm-settle-plan-persist，权威基线第 7 行），非本卡引入

### 下一步

父卡 t-0c7769 收尾

---
## 汇报 2（2026-10-06T10:43:13.824Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

补记全量读数：失败 68 = 基线 68 达标；7 条新增失败均不引用本需求模块；残余 tsc 错误全属别窗口半成品。

### 完成项

- pnpm test 全量：本次失败 68 条 = 基线 68 条（新增 7 / 不再失败 7，净零）⇒ 达标
- 归属判定：7 条新增失败分布在 5 个文件，对本需求模块的引用计数**全为 0**
- 我方新用例 tests/confirm-settle-order.test.ts 7/7 绿（不在任何失败清单里）
- tsc：3 条错误，**本卡文件 0 条**；其中 2 条是别窗口 17 秒前改 confirm-settle.ts 留下的未使用变量（gate / precondition）
- 并发写核对：本卡四处改动在核查时刻**全部仍在**（dialogRef / 包装 / notify:false / 透传），未被覆盖
- 处置：不代改别窗口文件、不 refresh 基线；这 2 条由其所属窗口收尾

### 下一步

父卡 t-0c7769 收尾；残余 tsc 错误交其所属窗口

---
