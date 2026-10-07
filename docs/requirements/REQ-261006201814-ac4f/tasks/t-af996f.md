# t-af996f 把靠中文文案兜底的断言换成断错误码（上半）·研发

> 需求：REQ-261006201814-ac4f 测试反向与异常覆盖补强（错误码矩阵 / 红基线分诊 / hermetic 夹具）

## 在做什么
把靠中文文案兜底的断言换成断错误码（上半）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
npx vitest run tests/capture-tool.test.ts tests/verdicts-and-rework.test.ts tests/task-tree.test.ts tests/task-run-contract.test.ts tests/accept-sheet-tool.test.ts tests/submit-prototype.test.ts tests/submit-prototype-exempt.test.ts 退出码 0。tests/design-registration.test.ts 的 3 条红是既有基线（已登记 docs/reviews/test-baseline.other.txt），不计入本卡。判据：本卡触及的站点里，凡回执带 code 载体的都有一条精确断码断言（实测 13 处 = 新增 3 + 本已具备 10）；无 code 载体的 12 处（capture notCreated 7 / accept_sheet 弹框失败 3 / submit design 空目录 2）如实上报为 src 实现缺口，按 D-3 不在本需求内修。且 git diff -U0 -- <本卡 8 文件> | grep '^-' | grep -v '^--- ' | grep -c 'expect(' 为 0（只追加，零删改）。

---
## 汇报 1（2026-10-07T07:26:32.003Z，窗口 session-13fffcba-1baf-45ca-92dc-3cd382ee51c8）

上半批断码升级：13 处站点已带精确断码（新增 3），12 处软失败回执无码按要求上报而不凑数

### 完成项

- 上半批 8 个文件逐个核过：4 个需要改（其中 3 个补伴随断码断言 + 注释），4 个本已带断码断言故不动
- 新钉精确断码 3 处：verdicts-and-rework 的三个拒绝路径断到小写码 invalid_input（其传输孪生码 REQBOARD_INVALID_INPUT）
- 核出本已带断码的 10 处并留证：task-tree 3、task-run-contract 3、submit-prototype 2、submit-prototype-exempt 2
- 如实上报 12 处无法断码的站点：capture notCreated 7 / accept_sheet 弹框失败 3 / submit design 空目录 2，回执里根本没有 code 或 error 载体，只带中文 note
- 对 12 处只加一行说明注释，绝不写 toBeUndefined 之类凑数断言；按 D-3 作为 src 实现缺口上报（要改 src 才能加码，红线内不做）
- 零删改核对：8 个文件剔除 diff 头行后的 expect 删除数为 0；success=false 站点数 25 → 25（只加伴随断言，不替换）
- 测试：7 个文件退出码 0（17/10/6/7/29/20/8 全通过）；design-registration.test.ts 的 3 条红是既有基线（已登记 other.txt），非本卡引入
- 偏差上报：原验收的两条量化口径不可达——8 文件全绿含既有基线红；success=false 计数不可能下降（与只追加自相矛盾），已按工具既有验收修订通道改写为可证伪口径

### 改动文件

- `tests/verdicts-and-rework.test.ts`
- `tests/capture-tool.test.ts`
- `tests/accept-sheet-tool.test.ts`
- `tests/design-registration.test.ts`

### 下一步

u9 下半批同样处理；u12 读数文件记下「软失败回执无码」这条实现缺口与验收口径偏差

---
