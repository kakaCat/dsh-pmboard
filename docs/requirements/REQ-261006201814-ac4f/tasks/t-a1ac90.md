# t-a1ac90 给测不了的码登记理由，并让名单只减不增·研发

> 需求：REQ-261006201814-ac4f 测试反向与异常覆盖补强（错误码矩阵 / 红基线分诊 / hermetic 夹具）

## 在做什么
给测不了的码登记理由，并让名单只减不增·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/error-code-exempt.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T07:19:38.020Z，窗口 session-13fffcba-1baf-45ca-92dc-3cd382ee51c8）

豁免白名单落地：5 个测不了的码逐条登记理由，名单与清单双向相等且只减不增

### 完成项

- 新增 tests/fixtures/error-code-exempt.json：frozenCount=5，逐条含 code/tier/reason/evidence/blocker/plan
- 登记仍不可触发的 5 个码：NOT_AUTORUN 与 REQ_NOT_FOUND 记 tool-layer-unreachable；AWAITING_MANUAL、DESIGN_COVERAGE_GATE、IMPLEMENTATION_COVERAGE_GATE 记 needs-chain-setup
- 每条 reason 写清「为什么当前测不了」并指向真实产生点，每条 plan 写清「将来怎么测」
- 新增 tests/error-code-exempt.test.ts：把规则抽成纯函数 exemptViolations，便于拿坏输入反证判据本身
- 双向钉死：白名单集合与清单 covered=false 集合逐字相等（少一条、多一条都报）
- 棘轮两把锁：条目数 ≤ frozenCount，且 frozenCount ≤ 测试里的硬上界常量（单改 JSON 数字会红）
- 有效性：tier 不得为 unclassified、reason/plan 非空且 reason ≤300 字、evidence 必须 路径:行号、blocker 命中受控枚举
- no-production-point 只许给死码：在产码打此标会被点名
- 反例一：从 JSON 删一条 → 双向相等报红；反例二：frozenCount 加 1 → 两条用例同时红；反例三：某条 reason 清空 → 报红
- 三个反例各自还原后复跑 3/3 通过，sha256 逐字节一致

### 改动文件

- `tests/fixtures/error-code-exempt.json`
- `tests/error-code-exempt.test.ts`

### 下一步

复核子卡核对双向相等与棘轮两把锁是否都有牙

---
