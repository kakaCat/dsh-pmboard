# t-bbcecc 并发窗口回归 + 真错配/声明根不可用用例（含重写失效用例）·研发

> 需求：REQ-261005123641-3982 修写盘根守卫误判：共享单例根被别的窗口/看板改写 → 立项与批准落库假失败

## 在做什么
并发窗口回归 + 真错配/声明根不可用用例（含重写失效用例）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T05:03:05.491Z，窗口 session-fe2396d0-cd4e-4724-89fd-16e436222a2f）

这一步做完，变化是：多窗口互踩这个事故形态被用例钉死了——邻居窗口改走全局根之后，本窗口的写入照样成功，而且只落在自己记录声明的项目目录里。

### 完成项

- 新增 tests/project-root-concurrency.test.ts 共 6 例：邻居窗口改走共享根后两次写入均成功且 B 目录零新增（TC-1）；记录是权威、校正到声明根（TC-2）；声明根不可用 → INVALID_WORKSPACE 且调用方目录零新增（TC-3）；非绝对根不判（TC-4，变更记①）；存量记录回落 callerRoot（TC-5）；校正失效 → MISMATCH 且文案含两个绝对路径（TC-6）
- 重写 tests/project-scope.test.ts 里编码旧契约的那条用例为等强度新断言：校正到记录声明根 + 产物只在声明根下 + 调用方当前根零新增
- 旧用例所在文件的其余四条（414/430/443/448）与 t8 三份清单逐字未动：git diff 11 insertions / 13 deletions，仅一个用例块
- 自测：tests/project-root-concurrency.test.ts 6/6 绿；tests/project-scope.test.ts 仅剩 HEAD 既存的 t8 红（EnsureKnowledgeLayer.ts:169）

### 改动文件

- `tests/project-root-concurrency.test.ts`
- `tests/project-scope.test.ts`

### 下一步

复核子卡核对用例的判别力（旧实现下 TC-1/TC-2 必须变红）

---
