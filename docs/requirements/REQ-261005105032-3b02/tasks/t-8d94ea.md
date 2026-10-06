# t-8d94ea 三条注入通路带上原型与 D-x（回合指令/节点输入包/子卡提示词）·研发

> 需求：REQ-261005105032-3b02 UI 需求必须在需求阶段交付原型产物并让原型可判定（门禁 + 唯一权威版本 + 锚点追溯）

## 在做什么
三条注入通路带上原型与 D-x（回合指令/节点输入包/子卡提示词）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T05:42:45.671Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

研发段：干活的窗口现在会被反复提醒「这张卡对应哪张原型、哪条裁定、怎么算验收」——而不是靠它自己想起来。

### 完成项

- 回合指令三段各追加本阶段该做的原型与裁定动作，既有指令行逐字未动
- 节点输入包新增原型与裁定两个可选字段，证据指针节追加两行
- 缺省不注入（不追加任何行），显式空数组才表示调用方声明没有——不拿空值冒充未知
- 子卡提示词新增三个小节标题：本卡原型（仅 UI 卡）、本卡裁定（原话逐字）、验收判据
- 原型路径取权威索引那一条，读不到就不注入，不取目录里第一个 html
- 隔离上下文与交棒底稿共用同一投影（有机械判据证明两处逐行相等）
- 28 例全绿、typecheck 0

### 改动文件

- `src/application/dive/round-state.ts`
- `src/application/internal/node-input-package.ts`
- `src/application/use-cases/ExecuteTask.ts`
- `tests/subtask-prompt-prototype.test.ts`
- `tests/node-input-package.test.ts`
- `tests/round-state-dive.test.ts`

### 下一步

联调段：核验三条通路与既有消费者零回归。

---
