# REQ-261001201200-8f8b 验收证据（t5 · 迁移兼容与端到端验证）

> 全部命令于 2026-10-01 20:28（本机 /Users/mac/Documents/ai/dsh/dsh-pmboard）实跑；输出为原文摘要。
> 未跑到的项**如实标注未跑**并给出复现步骤，不以「应该没问题」收尾。

## 1. C-11 发版前必须构建（host + client）

```
$ pnpm build
✔ Build complete in 1901ms            # host（tsdown）
✔ Build complete in 1147ms            # client
wrapped dsh-pmboard -> lib/client.js 309262 bytes
[verify-client] OK  bundle=331279 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
[BUILD-EXIT=0]
```

- 结论：**退出码 0**；`dist/index.mjs` 与 `lib/client.js` 均为本次构建产物（mtime 20:28）。
- 说明：本需求不改 client，C-11 同时充当**客户端回归确认**（C-12 的 verify-client 已含在 build 内且通过）。

## 2. C-14 提交前必须跑测试并与基线比对

```
$ npx vitest run
 Test Files  48 failed | 245 passed | 3 skipped (296)
      Tests  97 failed | 2897 passed | 20 skipped (3014)
```

| 指标 | 基线（HEAD） | 本次 | 判定 |
|------|--------------|------|------|
| 失败数 | 106 | **97** | ✅ 不高于基线（减少 9） |
| 通过数 | 2807 | **2897** | ✅ 增加 90 |

- 失败样例（均为**既有红**，与本需求无关）：`tests/application/repository.test.ts` 断言 `REQ-` 后为 6 位 hex，
  而需求 ID 已改为「时间戳 + 4 位 hex」格式（见仓库 CHANGELOG-req-id-timestamp.md）——属历史遗留。
- 本需求新增/迁移的用例**全绿**：`tests/dive-wake-wiring.test.ts`(7) + `tests/dive-rearm.test.ts`(8) + `tests/agent-deliverer.test.ts`(10) + `tests/dive-round-driver.test.ts`(17) + `tests/dive-round-state.test.ts`(15)。

## 3. 单卡证据（修前必红 → 修后全绿）

| 卡 | 命令 | 结果 |
|----|------|------|
| t1 装配契约 | `tsc --noEmit -p tsconfig.json` 过滤 pm-capture-root | 修前：`src/wiring/pm-capture-root.ts(56,21): error TS2554: Expected 3 arguments, but got 2.` → 修后：**无输出** |
| t1 | tsx 调 `createCaptureRuntime` 产出的 deliverer → `createRoundMessage` | 修前：`THREW: this.idFactory is not a function` → 修后：非空 `messageId`（显式注入 = `msg-explicit`；缺省回落 = `c-32779c`） |
| t2 守卫 | 把组合根**临时改回两参**再跑 `tests/dive-wake-wiring.test.ts` | **3 failed / 1 passed**（`this.idFactory is not a function`）→ 还原三参后 **7 passed**（实验后已还原，grep 确认三参行 1 处） |
| t3 留痕 | `npx vitest run tests/dive-round-driver.test.ts` | **17 passed**（含新增 3 例：写入 / 幂等 / teardown 不写） |
| t4 恢复 | `npx vitest run tests/dive-round-state.test.ts tests/dive-rearm.test.ts` | **23 passed**（真值表 5 行 + 三类负例 + 集成起轮 + 人暂停不越权） |
| t4（第二处断点） | 从 `src/index.ts` 的 `diveRoundPorts` 移除 `delivery` 后跑守卫 | **1 failed**（`expected … to contain delivery:`）→ 还原后 **7 passed** |

## 4. 改动面归属（证明「不含 schema / 客户端 / 工具面」）

```
$ stat -f "%Sm  %N" -t "%H:%M" <本次改动的文件> ; <未碰的文件>
20:22  src/adapters/AgentDeliverer.ts         20:26  src/application/dive/round-driver.ts
20:23  src/wiring/pm-capture-root.ts          20:26  src/application/dive/round-state.ts
20:26  src/application/internal/rearm.ts      20:26  src/http/routers/requirements.ts
20:27  src/index.ts
---
18:28  src/client/api.ts      18:55  src/shared/protocol.ts      18:28  src/tools/index.ts
```

- 本次会话开始于 20:09；我改动的文件 mtime 全部落在 20:22–20:27。
- `src/client/**`、`src/shared/protocol.ts`（schema）、`src/tools/**`（工具面）mtime 为 18:28–18:55，
  属**本次会话之前**就存在的未提交改动（工作区初始即 dirty），**不是本需求引入**。
- 结论：本需求**未改 schema、未改客户端、未改工具面**，与计划边界一致。

## 5. 端到端验收（**未跑**，如实标注）

**为什么未跑**：端到端判据是「人在会话里确认一个人工门之后，**不敲任何字**，观察会话是否自行起一轮」。
这需要**已应用本次修复的插件正在运行**；而本会话跑的是修复前的进程，`pnpm build` 产出的新 `dist/` 要等插件重载/重启后才生效。
因此本窗口无法自证该条，**不伪造结果**。

**修前基线（本次实测，作为对照）**：

```
$ grep -ro "\"kind\": *\"dive\"" ~/.dsh/sessions | wc -l
0                                   # 全机从未出现过任何 dive 回合消息
$ # 台账中本需求自身：
{"status":"implementing","dive":{"activation":"disarmed","phase":"active","roundsInStage":0}}
                                    # ← 被误 disarm 且 0 回合准入：本需求自己就是受害者
```

**复现步骤（插件重载后人工执行）**：

1. 触发一次人工门确认（会话弹框点「通过」，或看板点推进）；
2. **不要发任何消息**，等待数十秒；
3. 运行 `grep -ro "\"kind\": *\"dive\"" ~/.dsh/sessions | wc -l`，期望由 0 变为 ≥1；
4. 读台账该需求：`dive.roundsInStage` 应由 0 开始增长，且 `activation` 保持 `armed`。

> 补充：即使不重启，**存量误停摆需求**也可用看板「继续」触发恢复（FR-4 的显式入口）——
> 该路径已在 `tests/dive-rearm.test.ts` 的集成用例里覆盖（重新武装 → 起轮）。

## 6. 遗留与风险

| 项 | 状态 |
|----|------|
| 历史遗留的同缺陷需求 `REQ-260930231831-a8fa`（4 张卡全 todo） | **未处理**：取消/归档是人工闸门，需人裁定（复用或废弃） |
| 存量 13 条 `disarmed` 需求 | 不批量重写；靠 FR-4 恢复入口在下次推进/看板「继续」时收敛 |
| 客户端 37 个文件的工作区未提交改动 | 与本需求无关（会话前既存），未纳入本次改动面 |
