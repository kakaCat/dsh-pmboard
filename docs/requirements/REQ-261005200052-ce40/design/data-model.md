# 设计：数据模型与迁移（REQ-261005200052-ce40）

> 面：数据契约、门值域、迁移与回滚、判定的时间语义。**本需求不改表、不改 schema、零迁移。**

## 数据契约（不新增持久字段） <!-- serves: FR-2 -->

`PendingConfirmation` 保持现有形状，逐列用途：

| 字段 | 类型 | 本需求用途 |
|---|---|---|
| `ticket` | string | 文案里的定位符（pc-…） |
| `windowKey` | string | 判定归属：只对本窗口生效 |
| `requirementId` | string | 读台账取目标需求**状态与产物**（诊断四要素来源） |
| `target` | `'artifact' \| 'plan'` | 「有门」谓词的输入之一 |
| `kind` | ArtifactKind? | 「有门」「有产物」两谓词的输入（target=artifact 时） |
| `createdAt` / `interruptedAt` | number | 失效时刻 = `(interruptedAt ?? createdAt) + LIMITS.pendingConfirmTtlMs`，写进文案 |
| `outcome` | object? | 未作答判定（已有；不改） |

**不新增**字段、**不改**注册表存储形态、**不动** schema 版本：诊断信息是**读时投影**（`PendingConfirmFacts`），
不落盘——落了就会在换窗口 / 换机器时失真。

## 门值域：唯一事实源 <!-- serves: FR-2 -->

| 门 | 转移 | requiredKind |
|---|---|---|
| G1 确认需求文档 | brainstorming → design | `requirement` |
| G2 确认设计文档 | design → decomposing | `design` |
| G3 批准拆分计划 | decomposing → implementing | `decomposition` |
| G4 验收通过即归档 | accepting → archived | `verification` |

来源：`GATE_CATALOG`（`src/domain/gate/GateCatalog.ts`）→ 再导出为 `ARTIFACT_CONFIRM_GATES`。
`prototype` **不在值域**（实测：`Object.values(ARTIFACT_CONFIRM_GATES)` = requirement / design / decomposition / verification）。

`target='plan'` 视为有门：计划批准走 G3，其产物通道是 `decomposition`，票上的 `kind` 缺省。

## 迁移与回滚 <!-- serves: FR-2 -->

- **迁移：无**。守卫改成读时谓词后，存量挂起票按新判据**即时生效**，台账与外置分片一字不改。
- **回滚**：还原 `pending-guard.ts` 的两个谓词 + `SubmitArtifact.ts` 第 ⑤ 步 + 四处文案即可；
  回滚后行为回到"有票就拦"，与本次上线前逐字一致（无数据需要回退）。
- **灰度/开关**：不引入开关——判据是"是不是门"这种事实判断，配开关会让两套口径并存。

## 判定的时间语义 <!-- serves: FR-2, FR-5 -->

```
产物未在册 ──写路径调用──▶ 谓词⑤ 不成立 ⇒ 放行
      │
      └─（看板打开需求详情触发自动发现 / 显式登记）──▶ 产物在册
                                  └──下一次写路径调用──▶ 谓词⑤ 成立 ⇒ 恢复拦截
```

- 判据**每次调用重算**：不存在"一次性作废"，也不存在"放行了就永远放行"。
- TTL 语义不变：真门票到期仍自动失效（基准 `interruptedAt ?? createdAt`）。
- 终态需求（archived / done / canceled）：目标需求的产物集不再增长，谓词自然长期放行；
  文案要写明"该需求已终态，agent 侧无解，只等人点看板或等失效"。
