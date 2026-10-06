# 反向演练 · 原型工作原则节可被预算裁掉（t-ebb03c / FR-3）

> 目的：证明这一节**不是 floor**。若它被写成不可裁，用例必须变红——否则"不占每轮注入预算"
> 只是一句口号。

## 为什么这条演练是必要的

注入预算只有 24000 字符，而 heavy 节点已用近 19000。任何"永不裁剪"的新增节都会永久挤占预算；
FR-3 因此明确要求它是**可裁优先级（非 floor）**。可裁性只能靠"把预算压到贴地、看它真的消失"证明。

## 演练步骤与实测（2026-10-05，本机）

```
① 先问 floor 要多少（由 applyBudget 自己报，不靠估）：
   resolveStagePrompt({ stage:'brainstorming', difficulty:'heavy', category:'feature', budget: 10 })
   → overBudget.floorChars > 0   ← floor 判据确实生效

② 预算 = floorChars + 5（只够 floor，不够优先级 10）：
   → text 不含「原型工作原则」
   → fragmentIds 不含 'brainstorming/heavy-extra'
   → 但含 'brainstorming/heavy' 与 'common/iron-rules'（floor 未被误裁）

③ 不压预算（默认 24000）：
   → text 含「原型工作原则」
```

三条同时成立才说明：**裁的是这一节，不是随便裁；而且它确实在按预算让路。**

## 反向演练（本次实跑）：**删掉断言 → 用例必红**

"被裁掉了"可能只是"它本来就不在"。所以真做了一次反转，证明那条断言是承重的：

```
① 备份 scripts/inline-prompt-fragments.mjs
② 把 <阶段>/<难度>-extra.md 的优先级由 10 改成 'floor'（= 本节变成不可裁）
③ node scripts/inline-prompt-fragments.mjs 重生成
④ npx vitest run tests/skills-injection.test.ts
   → × TC-13 · 可裁（反向演练：证明它不是 floor）
     Tests  1 failed | 9 passed (10)        ← 期望的"红"
⑤ 还原脚本 + 重生成 → npx vitest run tests/skills-injection.test.ts → 10 passed（全绿）
⑥ node scripts/check-prompt-fragments.mjs → 退出码 0（片段与产物一致）
```

④ 说明 TC-13 不是恒真断言：**把本节写成 floor，它就红**。⑤⑥ 说明反转已逐字节还原、产物无残留。


## 落点为什么不是类型档（重要结论）

计划原写「追加到 `brainstorming/feature.md` 末尾」，实测**撞破既有不变量**：
类型档同时进 light 与 heavy，而 light 有 2500 字符上限；追加后 light(feature) 超限，
`tests/prompt-tiers.test.ts` 必红。故经人裁定改为**新增一个只作用于难度档的可裁槽**
`<stage>/<difficulty>-extra.md`：

| 项 | 值 |
|---|---|
| 落点 | `src/domain/prompt/fragments/brainstorming/heavy-extra.md` |
| 路由 | 只被 `brainstorming/heavy/*` 的壳 include（light 不受影响） |
| 优先级 | `10`（可裁）——与 floor 的 `heavy.md` / `overrides.md` 明确区分 |
| 该节长度 | 691 字符（≤ 1200 上限） |
| light(feature) 字符数 | 不受本节影响，仍 ≤ 2500 |
| heavy(feature) 字符数 | 19081（≤ 24000，overBudget 为空） |

命名刻意用**两段**：本仓三段 id 被「路由壳（text 空 + include）」占用，
`resolveFragmentRef` 会把任何三段非 `overrides` 的 id 判成壳
（`tests/node-panel-process-map.test.ts` 守着）；用三段会让这一节在客户端被渲染成壳。

## 关联用例

- `tests/skills-injection.test.ts` TC-13（可裁）/ TC-13b（只进 heavy、light 守 2500）
- `tests/prompt-tiers.test.ts`（六节点 light/heavy 分化与 2500 上限）
- `tests/prompt-gates.test.ts` 门禁 4（本节不是孤岛：被 heavy 路由命中）
