---
req_id: REQ-261005154851-8512
kind: evidence
---

# 兼容基线（REQ-261005154851-8512 · t4）

> 这一页存在的唯一理由：**证明"修 expert 没有顺手改掉存量需求的行为"**。
> 判据不是"看起来还是轻档"，而是**分片 id 逐字全等**（档位相同但分片顺序/集合变了也算破）。

## 基线快照（改造前 = 现在的默认行为）

标本（一段**推不出档位**的普通描述）：

```ts
{ title: '难度注入验收标本', description: '一段普通描述，不涉及架构、跨子系统或数据模型改动。' }
// stage: 'brainstorming', category: 'feature', 无声明
```

| 读数 | 值 |
|---|---|
| `routeKey` | `brainstorming/light/feature` |
| `fragmentIds` | `brainstorming/light/feature`、`brainstorming/light`、`brainstorming/feature`、`common/iron-rules` |
| `difficultyReasons` | 空（无声明 → 不编造依据） |

## 被哪几条用例钉住

| 用例 | 断言 |
|---|---|
| T-07 | 无声明 → `fragmentIds` 与上表快照**全等**（`toEqual` 数组比较，顺序也算） |
| T-08 | 脏数据 `'EXPERT'` / `' expert '` / `''` / `null` / `42` / `{}` 一律按未声明 → 同样全等，且 `difficultyFromDeclaredPrompt` 返回 `undefined`（**不抛错**） |
| T-11 | 无声明且推断不出 → `difficultyReasons` 为空数组（不编造依据） |

## 兼容口径（设计 §迁移与兼容 的落地）

| 面 | 口径 | 落地 |
|---|---|---|
| 存量需求（无 `promptDifficulty`） | 行为与改造前逐字相同 | T-02（投影不带键）+ T-07/T-08（取词全等） |
| 脏数据 | 按未声明处理，不抛错、不猜档 | T-08 |
| 历史注入 | **不追溯**（已注入过轻档的回合不补发） | 无回填代码；本需求零写盘 |
| 旧调用方 | 三处调用点只多一个**可选**入参 | T-09（静态断言）+ 既有套件零新增失败 |
| 回滚 | 回退构建即回到改造前（零本地写入、零 schema 变更） | `git revert` 后重跑探针，`declared_route` 应退回 light |

## 复跑方式

```bash
npx vitest run tests/injection-difficulty.test.ts -t "T-07"
npx vitest run tests/injection-difficulty.test.ts -t "T-08"
npx vitest run tests/injection-difficulty.test.ts -t "T-11"
```
