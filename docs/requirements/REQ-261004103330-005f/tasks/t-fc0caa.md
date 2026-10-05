# t-fc0caa 上限生效：同步快照 + 默认表降级 + 判定点停手

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
上限生效：同步快照 + 默认表降级 + 判定点停手

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/dive-round-state.test.ts 全绿且保留『未安装快照=默认 1000/10』既有断言；把 implementing 上限改成 3 且 roundsInStage=3 → 下一回合判定停手、停手原因含『已达上限』，且正在执行的那一回合不被打断；上限改回 10 → 继续续跑。

## 实施方案（implementation）
改 src/application/dive/round-state.ts 让 roundLimitFor 读模块级内存快照（保持同步签名、不插 await）；改 src/application/dive/stage-configs.ts 语义降级为默认值表；在 src/index.ts 装三路刷新（启动加载 / PATCH 广播 / 文件 mtime 轮询）；扩展 tests/dive-round-state.test.ts。

## 上游产出摘要（dependsSummary）
- 设置文件与系统记录两个适配器（含自动初始化与失败降级）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T09:24:39.195Z，窗口 session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b）

这张卡做完，看板上改一次上限就能救活空转的需求或收紧跑飞的需求——改小不会掐断正在执行的那一轮，只从下一个判定点起不再续跑。

### 完成项

- 阶段上限改为读运行时可改的快照，热路径保持同步、未引入 await
- 未装快照时回落默认值表，既有兼容断言与新增用例双向锁死
- 装配期三路刷新落地（灌初值 / 订阅变更 / 启动读盘），轮询周期复用既有旋钮、给 0 即关
- 停手仍在既有判定点、驱动逻辑一行未改；改小不掐断在跑回合有断言撑着
- 非数字/无穷大回落默认，避免比较恒假把上限变成无限
- 新增 15 条用例 + 扩既有驱动用例 3 条；全量失败集合与本需求零交集

### 改动文件

- `src/application/dive/round-state.ts`
- `src/application/dive/stage-configs.ts`
- `src/index.ts`
- `tests/dive-stage-limit-snapshot.test.ts`
- `tests/dive-round-driver.test.ts`
- `docs/requirements/REQ-261004103330-005f/notes/baseline.md`

### 下一步

批次 4：迁移脚本、开窗链路、弹窗骨架

---
