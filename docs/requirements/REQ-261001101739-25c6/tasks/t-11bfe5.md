# t-11bfe5 归属契约单测（可证伪）·研发

> 需求：REQ-261001101739-25c6 修复流程节点刷新后样式全丢（样式表归属）

## 在做什么
归属契约单测（可证伪）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/client-styles-ownership.test.ts → 6 passed；文件 tests/client-styles-ownership.test.ts 内定义 claimStyles 与 removeOwnedStyles 两个复刻函数（grep -c 各 ≥1）

## 汇报 1（2026-10-01T02:58:41.175Z，窗口 session-96ee4e52-6798-4e5b-b3a3-946152bfaf2a）

写完了一条可复跑的验证用例：一条命令就能证明样式表「别人认领不走、删了还能自愈」。

### 完成项

- 新增 tests/client-styles-ownership.test.ts：最小 DOM 替身（querySelector/All + createElement + dataset↔属性投影 + remove）
- 复刻宿主算法 claimStyles / removeOwnedStyles，覆盖 6 条：工厂执行期注入与归属章、认领不走、HMR 替换先删后建、存量无主表纠正、删表自愈、无 document 静默
- 替身 DOM 对未实现的选择器直接抛错（防止契约测试悄悄失效）
- npx vitest run tests/client-styles-ownership.test.ts → 6 passed

### 改动文件

- `tests/client-styles-ownership.test.ts`

---
