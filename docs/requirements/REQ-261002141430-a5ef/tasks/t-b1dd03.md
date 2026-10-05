# t-b1dd03 兼容、回滚与端到端核对·研发

> 需求：REQ-261002141430-a5ef 弹框在途即停手：PM 弹框出现时写 Dive 暂停态、作答后恢复

## 在做什么
兼容、回滚与端到端核对·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T06:40:01.146Z，窗口 session-0dc94a2a-9c00-455b-ac58-f96624a21da2）

这一步做完：这次改动没有留下需要回填的数据，也没有让旧台账变得读不懂——要退回去只需撤掉三处判定。

### 完成项

- 旧台账零影响：不新增持久字段、不 bump schemaVersion（停手位复用 dive.driverHealth）
- 重启后按「无在途登记」处理：心跳对账恢复（宁可多跑一轮，不要静默停摆）
- 回滚路径：删三处准入判定即回到改动前行为；残留 paused 由既有 recoverHealth 清掉
- 未装配 dialogs 的实例行为与改动前逐字一致（端口缺省即零行为）

### 改动文件

- `src/application/internal/awaiting-confirm.ts`
- `src/application/internal/rearm.ts`
- `src/application/dive/wake-heartbeat.ts`

### 下一步

证据段：构建与命令输出

---
