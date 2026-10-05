# t2 交付给后续卡的口径与约束（REQ-261004103330-005f）

> 来源：t2（设置文件与系统记录适配器）实现时提出的两个问题，**2026-10-04 由 owner 裁定**。
> 写给 **t8（settings 路由）** 与 **t11–t14（看板四屏）** 用。

## ① 系统记录文件损坏时，接口**不 500**：响亮 + 可用（owner 裁定）

t2 的实现口径：记录文件损坏时 `read()` **抛** `REQBOARD_SYSTEM_RECORD_INVALID`（对齐 `InjectionLogFile` 先例——损坏要响亮，绝不静默当空；静默等于把证据抹掉）。这条保留。

路由必须这样收：

```
GET /settings/system
  ├─ 正常 → 200 { ok:true, record, droppedEvents, ... }
  └─ 捕获 REQBOARD_SYSTEM_RECORD_INVALID →
       200 { ok:false, invalid:true, reason, path, hint }
       hint = 「记录文件损坏：<path>。不自动重建；改名或删除后重启会新建一份。」
```

**为什么是 200 + invalid 标记，而不是 500**：档案设施坏掉不该让整个设置页白屏——「运行上限」「存储与数据库」两屏与系统记录无关，必须照常可用。
但也不能静默当空：`invalid:true` + 注册页红字 + 可复制路径，**醒目且可行动**。看板「系统记录」屏据此显示红字，其余屏不受影响。

## ② `droppedEvents` 两个口径**都暴露、永不相加**（owner 裁定）

| 字段 | 语义 | 展示 |
|---|---|---|
| `droppedEvents`（进程内计数） | **本次运行**里丢了几条事件（重启清零） | > 0 即**红字**（这是"现在还在丢"，可行动） |
| `counters.droppedEvents`（已落盘） | **历史累计**丢了几条 | 灰字，标注「累计」，供复盘 |

**为什么不合并成一个数**：合并之后，"现在还在丢"与"以前丢过"再也分不开，而这两件事的处置完全不同（前者要马上查权限/磁盘，后者只需知道历史上有过）。
t2 的实现已接上 `withDroppedEvent`（修掉了 t1 里那段死代码），且**一次操作最多记 1 条**，不重复累加。

## ③ 附：t2 另外两处补强（后人不要"简化"回去）

- `updateStores` 里用 `staleSqliteReason` **兜一道**：`SqliteSnapshot.stale` 是必填字段，调用方忘标就会漏掉「库落后于分片」这个最危险的告警。
- 设置文件损坏时 `update()` **拒绝写入**：不覆盖人写坏的那份证据（先让人看到坏在哪，再决定怎么处置）。


## ④ 给看板四屏的中文名来源（t12 实测纠正，**后续屏照此**）

| 用途 | 真源 | 备注 |
|---|---|---|
| **流程节点名**（阶段） | `src/client/workflow-constants.ts` 的 `WORKFLOW_STAGES` | 该文件头注明写"所有流程节点名称必须从这里引用，禁止硬编码" |
| **任务状态名** | `src/domain/card-types.ts` 的 `STATUS_LABELS` | 与节点名**不是同一张表** |

`WORKFLOW_STAGES` 覆盖 8 个流程节点、**缺 `canceled`**；缺的那一个**复用任务状态表里的同名标签**
（`STATUS_LABELS.canceled` = 已取消），**不另造第二份中文名**——造第二份必然漂移。

> 设计文档 `design/frontend.md` 的 R5 只写了"取 `STATUS_LABELS`"，表述不够准确（它指的是任务状态表）。
> 以本表为准；t13/t14 若要用阶段名，照上表取。
