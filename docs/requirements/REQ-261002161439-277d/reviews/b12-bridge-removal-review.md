# 复核报告 · B12 删桥与端口切换（t-912d82 / t-600159）

> 复核对象：`REQ-261002161439-277d` 的「一次性把运行时切过去：删单册实现、改 95 处读点与三处同步缝」
> 复核日期：随本卡交付
> 复核方式：**反向核查 + 独立度量**（不采信实施汇报的自述，全部命令重跑）

## 一、复核项与结论

| # | 复核问题 | 方法 | 结论 |
|---|---|---|---|
| R1 | 旧实现是否真的删除（不是改名/兼容壳） | `ls src/adapters` + `grep -rn` | ✅ 三文件不在；`grep -rn 'JsonLedgerRepository\|ReqboardRepository' src` = **0** |
| R2 | 旧端口是否真从契约里摘掉（不是留着不用） | 读 `ports.ts` | ✅ `ReqboardRepository` 与 `snapshot()` 声明均已不存在；`UseCaseDeps.repo` 亦已摘除 |
| R3 | 是否还有漏迁的读点（`deps.repo` / `.snapshot()`） | `grep -rn`（排除注释） | ✅ 命中项全是**新存储内部**的 `repo` 字段（`ShardedRequirementStore.repo` = 分片仓储），非旧端口 |
| R4 | 同步缝是否真的收口（有没有留"同步假读"） | 读 `gate-wiring` / `dive` / `pm-capture-root` | ✅ 提示词段走摘要投影；`pm-capture-root` 内部异步化且错误走告警不吞（`catch` 无静默 return） |
| R5 | 有没有用 `as never` / `catch` 掩盖装配缺失 | 全仓 `grep` | ✅ `ColdWrite.ts` 无 `catch`；`as never` 命中 49 处均为既有形态（多为工具/边界转换），无新增掩盖 |
| R6 | 类型面是否收敛 | `npx tsc --noEmit` | ✅ **149** 条（基线 172、验收线 223） |
| R7 | 行为面是否回基线 | `pnpm test` + 与基线逐条 `comm` | ⚠️ 98 failed（基线 98，**不高于**）；逐条比对**新增 1 条** → 见 §二 |
| R8 | 迁移门是否真的拦得住 | `tests/reqboard/migration-gate.test.ts` | ✅ 4/4：只放 v9 单册时启动抛 `REQBOARD_REQUIRES_MIGRATION` 且**不生成** `requirements/` |
| R9 | 端口契约是否双实现同语义 | `tests/reqboard/store-contract.test.ts` | ✅ 68/68（内存实现与分片实现同表，读侧+写侧） |
| R10 | 端到端是否成立（真实 handler × 真实存储） | `tests/t16-http-queue-integration.test.ts` 等 4 文件 | ✅ 79/79 |

## 二、遗留问题（**不在本次修复范围，需专项卡**）

### R7 的 1 条新增失败：`tests/kb-archive-deposit.test.ts`

```
用例：落地：归档 → 条目 + 索引行 > 同源重复提交幂等：id 复用、索引行不重复
现象：第二次归档提交（index_entry 与首次不同 ⇒ 材料**确实变了**）被 COLD_IMMUTABLE「冷侧只读」拒
已排除：
  ① `isColdWriteExempt` 的两个 `return false` 分支——把两处都改成抛错，都不触发（诊断期实测）
  ② 「材料未变 ⇒ 无需写」这条路径——在 SubmitArchive 的两处写前加早退后仍被拒，随后已**收回**该改动
判定：拒绝来自提交路径中**除 archive/artifacts 之外的另一处写**，或 `isColdWriteExempt` 的触发键
     判定在真实数据上与预期不符 ⇒ 属**生产守卫逻辑**，非夹具迁移
处置：经裁决按专项卡处置；本卡不越界修改生产守卫（诊断期的改动已全部还原）
```

## 三、过程风险记录（诚实披露）

本次交付期间，为清理测试侧对已删类型的引用，实施方曾使用「按 tsc 报错全仓自动批量改」的脚本三次，
把**合法的**新端口实参、模块级声明与赋值头一并改坏，导致 tsc 一度冲到 262、测试 429 failed（新增 333）。
经五轮「聚类找主因 → 单文件验证 → `git diff` 还原」抢修，已回到 tsc 149 / 98 failed / 新增 1。
**教训已固化**（设计文档 §91 第 ㉔ 条）：批量只用于「形态完全一致且已 grep 数过」的替换；
凡涉及**增删属性 / 导入 / 声明**，一律逐文件。

## 四、复核结论

```
可判定的机器门：① 0 处 ✓  ② 149 ≤ 223 ✓  ④ 4/4 ✓  ⑤ 0 处 ✓
行为门：         ③ 98 failed（不高于基线 98），仅剩 1 条新增，且该条已定性为生产守卫疑 bug
⇒ 本次「删桥 / 端口切换」的**交付面**（旧实现下线、读点迁移、同步缝收口、迁移门）**复核通过**；
  唯一未闭环项是他人格的生产守卫，建议单开卡。
```
