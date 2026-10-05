# t-8fdabe 归属契约单测（可证伪）·测试

> 需求：REQ-261001101739-25c6 修复流程节点刷新后样式全丢（样式表归属）

## 在做什么
归属契约单测（可证伪）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/client-styles-ownership.test.ts → 6 passed；git stash push -- src/client/styles.ts src/client/conversation-progress.ts src/client/page/host.ts 后同命令 → ≥5 failed，git stash pop 还原后再次运行 → 6 passed

## 汇报 1（2026-10-01T02:58:41.531Z，窗口 session-96ee4e52-6798-4e5b-b3a3-946152bfaf2a）

测试通过且证据可证伪：修复前跑这条用例会红（5/6 失败），说明它测的是真东西，回归拦得住。

### 完成项

- 验收① npx vitest run tests/client-styles-ownership.test.ts → 6 passed (6)
- 验收② 可证伪：git stash push -- src/client/styles.ts src/client/conversation-progress.ts src/client/page/host.ts（回到修复前实现）→ 同命令 5 failed | 1 passed；git stash pop 还原后恢复 6 passed
- 验收③ 替身 DOM 对未实现选择器抛错（生产代码换选择器时用例会红，不会静默通过）

### 改动文件

- `tests/client-styles-ownership.test.ts`

---
