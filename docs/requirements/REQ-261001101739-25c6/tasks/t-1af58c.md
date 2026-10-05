# t-1af58c 归属契约单测（可证伪）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
用一条可复跑的自动化用例把「别的插件认领不走、被删了还能自愈」钉死，并证明这条用例在修复前的代码上会失败。

## 解决什么问题
这种「看不见的归属」问题最容易悄悄回归：界面今天好了，下次别的插件改动又坏。没有一条会失败的用例，就没有证据说明修复真的生效、也拦不住回归。

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
任何人一条命令就能验证归属契约；并且把修复前的代码放进去，这条用例会红——证明它测的是真东西。

验收（跑什么 / 看到什么算过）：
① npx vitest run tests/client-styles-ownership.test.ts → 6 passed；② 可证伪：git stash push -- src/client/styles.ts src/client/conversation-progress.ts src/client/page/host.ts 后同命令 ≥5 failed，随后 git stash pop 还原；③ 生产代码用到未实现的选择器时替身 DOM 抛错。

## 实施方案（implementation）
新增 tests/client-styles-ownership.test.ts：最小 DOM 替身（querySelector/All + createElement + dataset↔属性投影）与宿主算法复刻（claimStyles / removeOwnedStyles），覆盖存量表归属纠正不重复插表、认领不走、删除删不掉、删后自愈、无 document 静默。

## 上游产出摘要（dependsSummary）
- 样式表自带归属章并在工厂执行期注入

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T02:59:48.979Z，窗口 session-96ee4e52-6798-4e5b-b3a3-946152bfaf2a）

多了一条能拦住回归的自动化用例：一条命令验证样式表归属契约，且它在修复前的代码上确实会失败。

### 完成项

- tests/client-styles-ownership.test.ts 落地（最小 DOM 替身 + 宿主算法复刻，6 条用例）
- npx vitest run tests/client-styles-ownership.test.ts → 6 passed
- 可证伪实验：stash 三个源文件回到修复前 → 5 failed | 1 passed；pop 还原后恢复 6 passed
- 三条子卡（研发/复核/测试）全部 done

### 改动文件

- `tests/client-styles-ownership.test.ts`

---
