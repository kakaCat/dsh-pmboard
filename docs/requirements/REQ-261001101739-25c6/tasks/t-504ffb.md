# t-504ffb 存量无主表的兼容与归属纠正·研发

> 需求：REQ-261001101739-25c6 修复流程节点刷新后样式全丢（样式表归属）

## 在做什么
存量无主表的兼容与归属纠正·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/client-styles-ownership.test.ts -t "存量无主表" → 1 passed（预置同 data-plugin-css、无 data-plugin 的表后调用 injectStyles，表数量仍为 1 且归属被纠正）

## 汇报 1（2026-10-01T02:54:45.308Z，窗口 session-96ee4e52-6798-4e5b-b3a3-946152bfaf2a）

老窗口里那张没有归属的旧样式表会被就地补上归属，不会再插第二张——实测预置的无主表在自愈后归属变成 dsh-pmboard、样式表数量仍是 1。

### 完成项

- injectStyles() 命中既有表且 data-plugin 不符时就地纠正归属并返回（不追加第二张表）
- npx vitest run tests/client-styles-ownership.test.ts -t "存量无主表" → 1 passed
- 真实 GUI：把当前表退化成旧版无主表（去掉 data-plugin、内容照旧）→ 触发一次自愈 → count=1 / owner=dsh-pmboard / cssLen=123466

### 改动文件

- `src/client/styles.ts`

---
