# t-edf862 需求级项标题单点（FR-4）·联调

> 需求：REQ-260930183951-eb6c 修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续

## 在做什么
需求级项标题单点（FR-4）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/sheet-selfproof.test.ts tests/domain/verification-doc.test.ts 全绿；渲染断言：同一张验收单内需求级项标题去重后数量等于项数（无重名），且文档同时含「· E2E 覆盖」「· 锚点失效」「· 追溯断链」

## 汇报 1（2026-09-30T12:35:20.602Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

三处显示同一口径接上了：提交时渲染、裁决后回填、弹框 header 的标题完全一致，且同一单据里不再出现重名。

### 完成项

- 整链用例 tests/sheet-selfproof.test.ts：同一张验收单里多个需求级项的标题互不相同（Set 去重后数量等于项数）
- 渲染通道：tests/domain/verification-doc.test.ts 断言渲染出的文档同时含「需求级验收 · E2E 覆盖」「· 锚点失效」「· 追溯断链」三种可区分标题
- 回填与弹框通道：verification-doc-writer / AcceptSheet 均改为调用同一单点，grep 复核无第二处字面量

### 改动文件

- `tests/sheet-selfproof.test.ts`
- `docs/requirements/REQ-260930183951-eb6c/tests/implementation-2026-09-30.md`

### 下一步

复核段：核对标题映射表与设计 I-4 一致。

---
