# t-6ce03a 把被基线放行的失败分开登记：哪些是反向用例、哪些是架构债·研发

> 需求：REQ-261006201814-ac4f 测试反向与异常覆盖补强（错误码矩阵 / 红基线分诊 / hermetic 夹具）

## 在做什么
把被基线放行的失败分开登记：哪些是反向用例、哪些是架构债·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/baseline-triage.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T07:19:58.073Z，窗口 session-13fffcba-1baf-45ca-92dc-3cd382ee51c8）

红基线分诊落地：68 条失败拆成 reverse 18 / other 50 两份不相交清单并逐条登记红因

### 完成项

- 把冻结基线 docs/reviews/test-baseline.failures.txt 的 68 条失败拆成两份不相交清单：reverse.txt 18 条、other.txt 50 条，格式与基线逐字同格式
- 新增 docs/reviews/test-baseline.reverse.notes.md：front-matter 记 reverse_count=18 / other_count=50 / unknown_count=1，四列表逐条给红因类别、红线内可达性、证据
- 新增 tests/baseline-triage.test.ts：双向钉死（reverse ∪ other == failures、reverse ∩ other == 空）+ notes 用例列与 reverse 双向相等 + 表头计数与实际行数逐字一致 + 红因类别命中受控枚举 + 计数只减不增
- 新增 tests/drill/triage-baseline.mts：只读只报告（不写盘），支持 --json，有差集即非零退出
- 红因分类：assertion-shape 9 / fixture-drift 6 / src-debt 2 / unknown 1；可达性 可 15 / 不可达 3
- 未改任何既有文件：failures.txt 与 test-baseline.md 的 git status 零命中，未碰 src，未删改既有断言
- 验收：npx vitest run tests/baseline-triage.test.ts → 11/11 通过；npx tsx tests/drill/triage-baseline.mts → 差集全为 0，退出码 0
- 反向演练（本窗独立复核）：往 failures.txt 追加一条假失败 → 守卫必红并点名该行；sha256 逐字节还原后复跑 11/11 绿
- 并集独立核对：cat reverse + other 排序后与 failures 排序逐一 diff，无差异

### 改动文件

- `docs/reviews/test-baseline.reverse.txt`
- `docs/reviews/test-baseline.other.txt`
- `docs/reviews/test-baseline.reverse.notes.md`
- `tests/baseline-triage.test.ts`
- `tests/drill/triage-baseline.mts`

### 下一步

复核子卡核对两份清单的划分口径与红因分类是否站得住；u7 把本条纳入反向演练组

---
