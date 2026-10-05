# t-6dbcb4 定死长文本入参约定契约：共享常量 + 覆盖清单 + 断言助手·研发

> 需求：REQ-261002115204-ba52 长文本工具参数写法约定：防整轮失败的入参约束

## 在做什么
定死长文本入参约定契约：共享常量 + 覆盖清单 + 断言助手·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T03:54:34.498Z，窗口 session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5）

这一步做完，「模型写长文本参数时要怎么写字」从一句口头约定变成了代码里唯一的一份契约：工具侧只需引用一处常量，写错/漏接会被用例当场点出来。研发段交付内容——(1) src/tools/shared.ts 落地 LONG_TEXT_ARG_NOTE（42 字，含三锚点：每条短句 ≤60 字 / 需引号用「」/ 超长拆成多次调用）与只读清单 LONG_TEXT_FIELDS（15 条 = 8 个工具 × 各自长文本字段）；(2) tests/arg-guidance.test.ts 落地断言助手 assertNoteAnchors（返回缺失锚点列表）与 TC-1（三锚点 + ≤120 字 + 清单 ≥7 工具）、TC-1b/TC-2/TC-4 反向证伪。证据已复跑：约定常量用例 3 passed（7 skipped），全文件 10 passed；清单实测 15 条 / 8 工具；常量 42 ≤ 120 字。

### 完成项

- src/tools/shared.ts：新增 LONG_TEXT_ARG_NOTE（42 字，三锚点齐）与只读 LONG_TEXT_FIELDS（15 条 / 8 工具）
- tests/arg-guidance.test.ts：断言助手 assertNoteAnchors + TC-1 三锚点断言 + 清单登记 ≥7 工具断言
- 反向证伪到位：缺锚点的文本喂断言助手必须报缺（TC-1 反向分支）
- 证据复跑：npx vitest run tests/arg-guidance.test.ts -t 约定常量 → 3 passed / 7 skipped；全文件 → 10 passed
- 实测常量长度 42 字（≤120），清单 15 条 / 8 工具（≥7）

### 改动文件

- `src/tools/shared.ts`
- `tests/arg-guidance.test.ts`

### 下一步

交复核段（t-44849a）核对「约定是否真的被守住」；随后逐卡回填 t2/t3/t4/t5 的完工记录。

---
