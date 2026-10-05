# REQ-261002140814-1a5d 拆分计划 · 解锁回执无损 + 留痕可见 `serves: FR-1, FR-2, FR-3`

> **目标**：让 `reqboard_clear_pause` 的成功回执成为**无损 JSON**（不再"锁开了却报 value is not lossless JSON"），
> 并让解锁留痕在看板上真正可见；同时补上"把修复退回去必红"的回归用例与被绕过的门禁。
>
> **做法**：值在**变更器内**捕获 → 缺值**条件展开** → mutator 返回 `LedgerChange` → 失败判定改按 `changed.requirements`
> → 留痕写 `body` → 新增 lossless 回归用例 → 删掉契约测试对 `undefined` 的豁免。
>
> **不动**：台账 schema、工具签名、`output.schema` 字段集合、`dive` 状态机语义；**无数据迁移、无回填**；回滚 = revert 本次提交。

```
改动面（1 源文件 + 2 测试文件，零 schema 变更，不新增工具）

  src/application/use-cases/ClearPause.ts   ← 主修：回执形状 + 留痕字段 + 失败分支
  tests/clear-pause-lossless.test.ts        ← 新增：UC-1..5 + 反向证伪（修前必红）
  tests/output-contract.test.ts             ← 修改：删掉「undefined 值当省略」的豁免
```

## 1. 改动盘点 `serves: FR-1, FR-2, FR-3`

| 动作 | 路径 | 说明 |
|---|---|---|
| 修改 | `src/application/use-cases/ClearPause.ts` | ① 闭包 `previousActivation` 在 mutator 内赋值（不再从 `mutate()` 结果读）；② mutator 返回 `{ requirements: [req] }`；③ 回执用条件展开产出 `previous_activation`；④ 失败判定 `result.changed.requirements.length === 0` → `REQBOARD_MUTATION_FAILED`；⑤ 三处 `reject(...)` → `return reject(...)`（收窄 `target`）；⑥ 留痕键 `text` → `body` |
| 新增 | `tests/clear-pause-lossless.test.ts` | 头 20 行含 `// serves: FR-1, FR-2, FR-3`；复用 `undefinedPaths` 口径；夹具照 `tests/output-contract.test.ts` 的 `depsWith()`（真实 `JsonLedgerRepository` + 临时工作区）。含反向证伪（旧形状喂断言必报缺） |
| 修改 | `tests/output-contract.test.ts` | `assertConformsToSchema` 删除 `obj[k] === undefined` 豁免 → 值为 `undefined` 判红；保留并补强"注入 undefined 必红"的反向自检 |
| 删除 | — | 无（不删任何公开能力、不删测试） |
| 迁移 | — | **无**：schemaVersion 不 bump、不写迁移脚本、不回填历史 `text` 评论（登记为已知残留） |

## 2. 任务表 `serves: FR-1, FR-2, FR-3`

| 计划 key | 任务标题 | phase | side | 依赖 | 摘要 |
|---|---|---|---|---|---|
| t1 | 冻结并修正解锁回执契约（无损 + 不说假成功） | implement | backend | — | **契约先行**：值捕获位置、条件展开、LedgerChange 形状、失败判定四件套 |
| t2 | 解锁留痕改写入 `CommentRecord.body` | implement | backend | t1 | 写侧字段名归位，让看板评论可见（`text` → `body`） |
| t3 | 新增解锁回归用例（UC-1..5 + 反向证伪，修前必红） | test | backend | t1, t2 | 回执无损 / 缺值省略 / 并发失败 / 拒绝路径 / 留痕可见 + 断言自证 |
| t4 | 契约门禁补洞：值为 `undefined` 的属性判红 | test | backend | t1 | 删掉豁免，并证明门禁不是恒真（注入必红） |
| t5 | 迁移兼容与端到端验证（无回填 + 类型清零 + 基线 + 构建） | test | backend | t2, t3, t4 | 集中产出验收证据：命令 + 输出摘要 + 人工端到端记录 |

**批次**：批次 1 = t1 → 批次 2 = **t2、t4**（互不依赖，可并行）→ 批次 3 = t3 → 批次 4 = t5。

## 3. 覆盖对照表 `serves: FR-1, FR-2, FR-3`

| 需求条款 | 接收任务 | 落点说明 |
|---|---|---|
| FR-1 回执无损 + 不说假成功 | t1, t3, t5 | t1 改值与形状、t3 断言"无 undefined 属性 / 缺值省略 / 并发失败不报成功"、t5 出证据 |
| FR-2 留痕写 `body` | t2, t3, t5 | t2 改写入键名、t3 断言 `body` 非空且无 `text` 键、t5 人工看板复核 |
| FR-3 回归 + 门禁补洞 | t3, t4, t5 | t3 反向证伪、t4 删豁免 + 注入自检、t5 基线比对 |

> 三条条款均有落点，**无「本轮不做」条款**。

## 4. 卡内验收（可证伪） `serves: FR-1, FR-2, FR-3`

| 计划 key | 验收命令 | 通过条件 |
|---|---|---|
| t1 | `pnpm typecheck 2>&1 \| grep ClearPause`；`npx vitest run tests/output-contract.test.ts`；`grep -n "previous_activation" src/application/use-cases/ClearPause.ts` | ① 无输出（改前 6 条 → 0）；② 契约扫描全绿（return 键 ⊆ schema 声明）；③ 该键只出现在条件展开那一行，且 mutator 返回 `{ requirements: [req] }` |
| t2 | `pnpm typecheck 2>&1 \| grep ClearPause`；`grep -n "text:" src/application/use-cases/ClearPause.ts` | ① 无输出（TS2353 消失）；② 无输出（不再写 `text` 键） |
| t3 | `npx vitest run tests/clear-pause-lossless.test.ts` | 全绿：UC-1 回执 `undefinedPaths` 为空且 `previous_activation === 'armed'`；UC-2 该键**整体省略**（`hasOwnProperty` = false）；UC-3 `error.code === 'REQBOARD_MUTATION_FAILED'` 且不返回 success；UC-4 两个拒绝码 + 零写入；UC-5 `body` 含文字且无 `text` 键；反向项喂旧形状必报缺 |
| t4 | `npx vitest run tests/output-contract.test.ts`；`grep -n "obj\[k\] === undefined" tests/output-contract.test.ts` | ① 全绿（既有工具成功路径不被误伤）；② 无输出（豁免已删）；③ 反向自检：给断言喂 `{ declared: undefined }` 必须判红 |
| t5 | `pnpm test`；`pnpm build`；`git diff --stat`；人工端到端 | ① 失败数 ≤ 基线 106 且新增用例全绿；② 退出码 0 且 `dist/index.mjs` 已更新；③ diff 仅含 §1 列举的 3 个文件（无 schema、无客户端改动）；④ 在 armed 需求上真调 `reqboard_clear_pause`：回执含 `previous_activation` 且**无报错**，看板阶段评论能看到该留痕 |

## 5. 验收与证据 `serves: FR-1, FR-2, FR-3`

| 需求断言 | 证据形态 | 由谁产出 |
|---|---|---|
| A1 成功回执为无损 JSON | vitest 输出（用例名 + passed/失败计数），`undefinedPaths` 断言为空数组 | t3 |
| A2 缺值路径省略键（不是 undefined/null） | 同上用例中 `hasOwnProperty('previous_activation') === false` 的断言行 | t3 |
| A3 失败不报假成功 | 同上用例中 `REQBOARD_MUTATION_FAILED` 断言 + 台账 version 未变 | t3 |
| A4 留痕可见 | `comments.at(-1).body` 断言 + 人工看板截图/描述 | t3、t5 |
| A5 门禁不再漏 | 契约测试输出 + "注入 undefined 必红"的反向自检 | t4 |
| A6 类型错误清零 / 全量不退化 / 构建通过 | `pnpm typecheck` 过滤空输出、`pnpm test` 与基线 106 比对、`pnpm build` 退出码 0 | t5 |

## 6. 风险与回滚 `serves: FR-1, FR-2, FR-3`

| 风险 | 处置 |
|---|---|
| t4 删豁免后暴露出**其它**工具也有 undefined 值属性 | 按需求边界「只登记不修」：把发现写进验收材料，另立需求；不得在本需求里顺手改 |
| t1 的失败判定改活后，正常路径被误判为失败 | t3 的 UC-1 断言"成功路径仍 success"，CI 会拦住；判定只认 `changed.requirements.length === 0` |
| 端到端需要重启宿主才生效 | t5 明确 `pnpm build` 后再验；未重启则如实标注"未验证"（禁止以"应该没问题"收尾） |
| 需要回滚 | `git revert` 单个提交；零迁移 ⇒ 无补偿脚本、无半写状态 |
