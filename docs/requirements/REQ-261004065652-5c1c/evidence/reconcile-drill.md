# 终态收手对账 · 副本演练（REQ-261004065652-5c1c t8 / FR-9）

> 判据：拿**真台账的副本**跑一遍启动对账，逐文件 sha256 前后对比 —— 把「改没改」变成字节事实。
> 退出码 0 = 零改写；1 = 台账被改动（响亮失败）。

## 命令

```bash
rm -rf /tmp/drill-src && mkdir -p /tmp/drill-src && cp -R ~/.dsh/reqboard/. /tmp/drill-src/
npx tsx scripts/reconcile-terminal-drill.mts --src /tmp/drill-src        # 人读
npx tsx scripts/reconcile-terminal-drill.mts --src /tmp/drill-src --json # 机器可读
```

## 结果（2026-10-04 实测）

```
扫描条数: 47
已归一  : （无）
冷侧写不动（逐条点名）: 35 条，全部 REQBOARD_COLD_IMMUTABLE
仍 armed 的终态记录: 35 条（全部 status=archived）
逐文件 sha256: 改动 0 / 新增 0 / 删除 0   ← 零改写
```

```json
{"scanned":47,"reconciled":0,"skippedCold":35,"changed":0,"added":[],"removed":[]}
```

## 与计划验收口径的差异（重要，须记档）

计划原定验收是「对账改写 3 条 → 反向脚本还原 → 与原件 sha256 一致」。实施时（t4）实测推翻了这个前提：

- 存储层把 `done` / `archived` 判为**冷侧只读**（`REQBOARD_COLD_IMMUTABLE`，唯一例外是"归档收口"那一族字段，
  `dive` 不在其中）——而对账要改的正是终态记录 ⇒ **对账根本写不进去**；
- 既然写不进去，"反向还原"就没有对象；写一个永远走不到的回滚脚本只会变成死代码；
- 故本卡把口径改成**更强的一种**：不是「改完能还原」，而是「**一个字节都不改**」——
  且把改不动的那些**逐条点名**（`skippedCold` + 响亮 warn），由人决定是否放宽豁免（见 `decisions.md` D-5）。

## 修正一处此前的数字（诚实边界）

早前几份汇报（t4 卡、decisions.md D-5）写的存量是「**3 条**」——那只是**热侧** `requirements/` 目录里看到的。
本演练扫全册（含归档侧）后的真实数字是 **35 条**（全部 `archived`）。已更正：存量比原先说的多，
但这不改变结论——它们行为上都是安全的（终态需求不会被驱动，`drive()` 与心跳都按开放状态过滤），
且预防半边已保证**不再产生新的**。

## 35 条明细（全部 armed / archived）

- `REQ-261003204143-3219` status=archived driverHealth=advance-fail
- `REQ-261003204149-1e80` status=archived driverHealth=advance-fail
- `REQ-261003191948-e94a` status=archived driverHealth=advance-fail
- `REQ-261002161439-277d` status=archived driverHealth=-
- `REQ-261003150739-b98d` status=archived driverHealth=-
- `REQ-261002173819-69c7` status=archived driverHealth=-
- `REQ-261002153446-c600` status=archived driverHealth=-
- `REQ-261002164800-d8f2` status=archived driverHealth=aborted
- `REQ-260930231831-a8fa` status=archived driverHealth=-
- `REQ-260930230225-71be` status=archived driverHealth=round-limit:accepting
- `REQ-261002140814-1a5d` status=archived driverHealth=-
- `REQ-261002141430-a5ef` status=archived driverHealth=aborted
- `REQ-261002150038-344a` status=archived driverHealth=-
- `REQ-260930215459-d718` status=archived driverHealth=-
- `REQ-261001203114-19b6` status=archived driverHealth=-
- `REQ-261002105242-a3fb` status=archived driverHealth=aborted
- `REQ-261002115204-ba52` status=archived driverHealth=-
- `REQ-261001201200-8f8b` status=archived driverHealth=round-limit:archived
- `REQ-261001210304-0dfb` status=archived driverHealth=-
- `REQ-260930094139-2d65` status=archived driverHealth=-
- `REQ-260930123701-250a` status=archived driverHealth=-
- `REQ-260930155231-0862` status=archived driverHealth=-
- `REQ-260930182521-4fee` status=archived driverHealth=-
- `REQ-260930183951-eb6c` status=archived driverHealth=-
- `REQ-260930193929-897b` status=archived driverHealth=-
- `REQ-260930194112-1ab8` status=archived driverHealth=-
- `REQ-261001101739-25c6` status=archived driverHealth=-
- `REQ-261001110934-3766` status=archived driverHealth=-
- `REQ-261001124111-5d36` status=archived driverHealth=-
- `REQ-261001143526-8475` status=archived driverHealth=-
- `REQ-261001154450-b918` status=archived driverHealth=-
- `REQ-261001170807-06fd` status=archived driverHealth=-
- `REQ-261001184609-cecb` status=archived driverHealth=-
- `REQ-261001202058-0fbe` status=archived driverHealth=-
- `REQ-261001213924-1441` status=archived driverHealth=-

## 复跑判据

```bash
npx tsx scripts/reconcile-terminal-drill.mts --src <副本路径> --json | jq -e '.changed|length==0'
# 退出码 0 即：对账对台账零改写
```
