# REQ-261002140814-1a5d 架构设计 · 解锁回执链路对齐 `serves: FR-1, FR-2, FR-3`

> 一句话：不改架构，只把「**已经写成功的副作用**」与「**回执**」重新对齐——回执必须是无损 JSON，且必须如实反映副作用。
> 读者：实施者（改哪一行、为什么）、复核者（凭什么说改对了）。
> 术语：**回执** = 工具返回值；**留痕** = 写进台账 `comments[]` 的解锁评论。

## 1. 现状链路与三处病灶 `serves: FR-1`

```
 reqboard_clear_pause.execute()
   └─ clearPause(deps, windowKey, args)
        ├─ ① deps.repo.snapshot() → openRequirementsFor(snapshot, windowKey) → target
        ├─ ② deps.repo.mutate('dive-cleared', mutator)
        │        mutator: 改 req.dive / push 留痕 / bump version ──► 已落盘 ✅（锁真的开了）
        │        mutator `return { previousActivation }`  ← 病灶 A：既不是 LedgerChange，
        │                                                     mutate 也不回传自定义值
        │        mutate 返回 { changed, revision }
        ├─ ③ `result.previousActivation`                  ← 病灶 B：MutateResult 无此键 ⇒ 恒 undefined
        │                                                     （不是偶发，是必然；TS2339 已报）
        └─ ④ return { …, previous_activation: undefined } ← 病灶 C：绑定层无损 JSON 校验整体拒收
                 ⇒ agent 看到 "value is not lossless JSON"，副作用却已发生（误报）
```

病灶 A/B/C 是**同一条链**上的三环，缺一不可：A 让值没传出来，B 把 undefined 读进来，C 把 undefined 变成硬错误。
留痕字段名（病灶 D：写 `text`、读 `body`）在同一函数里，与 A–C 无因果，但同属"汇报坏了"，一并修。

## 2. 目标链路 `serves: FR-1`

```
   ├─ 值在**变更器内**捕获：let previousActivation; …mutator 里 previousActivation = req.dive?.activation
   ├─ mutator 返回 LedgerChange：{ requirements: [req] }（按端口契约说明"改了什么"）
   ├─ 回执组装：...(previousActivation !== undefined ? { previous_activation } : {})
   └─ 失败响亮：result.changed.requirements.length === 0 ⇒ 抛 REQBOARD_MUTATION_FAILED（不报假成功）
```

## 3. 关键取舍：值从哪取 `serves: FR-1`

| 方案 | 做法 | 取舍 |
|---|---|---|
| **A（选）变更器内捕获** | 闭包变量在 mutator 里赋值 | 与**实际被写入的那份 draft** 同源，值必然等于写入前值；mutator 同步执行、无竞态 |
| B 写前快照读取 | 从 `deps.repo.snapshot()` 的 target 上取 | 少一个变量，但快照与 mutate 之间可能夹入别的变更 ⇒ 值与"写入前那一刻"可能不一致；语义上偷懒 |

选 A：本函数要报的是"**我改之前**是什么状态"，只有变更器手里的 draft 才是权威。

## 4. 数据层影响与回滚 `serves: FR-1, FR-2`

| 维度 | 结论 |
|---|---|
| 是否改表 / 改 schema | **否**：`RequirementRecord.dive`、`CommentRecord` 结构一字不动，`schemaVersion` 不 bump |
| 是否迁移 / 回填 | **否**：历史台账里用错键的 `text` 评论保留原样（读方只读 `body` ⇒ 那条评论继续不可见，属**已知残留**，见 §5） |
| 开关 / 灰度 | **无**：改动是纯回执形状 + 一个写入键名，无需灰度 |
| 回滚路径 | `git revert` 本次提交即可；因为零数据迁移，回滚**不需要补偿脚本**，也不会留下半写状态 |

## 5. 已知残留（明确不修，理由）`serves: FR-3`

| 残留 | 为什么不修 |
|---|---|
| 历史台账里 `text` 键的解锁评论仍不可见 | 修它要**数据迁移**或**宽容读回退**，都是新决策（改归档数据 / 放宽读契约），越出本需求边界；本需求只保证**今后**写对 |
| `walkJsonValue` 不认 `undefined` 这一层在宿主侧 | 宿主行为，不在本仓；本仓只能保证不产出非无损值（门禁补洞见 FR-3） |
| 其它文件 188 条历史类型错误 | 与本需求无关，无因果 |
