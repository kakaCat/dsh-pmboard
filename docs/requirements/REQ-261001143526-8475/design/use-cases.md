---
req: REQ-261001143526-8475
doc: use-cases
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 用例设计 · 五个场景（REQ-261001143526-8475）

> **TL;DR**：五个真实动作——**查规范**（开工前）、**按规范自证**（改完）、**收尾沉淀**（缺什么补什么）、
> **新增脚本被拦**（门禁提醒）、**发版前逐条过**。每个都写清：谁触发、读什么、跑什么、什么算过。

## UC-1 开工前查规范：知道"这活干完要跑什么" `serves: FR-1, FR-2, FR-5, FR-6`

```
Agent 接到卡（例：给看板加一个视图）
   |
   +--> reqboard_kb(kind='standard', query='客户端')        # 命中 C-12「改客户端必须重建 bundle」
   |      返回：时机=改动后 / 命令=pnpm build:client / 期望=verify-client OK
   |
   +--> 若不确定要看全：reqboard_kb(id='kb-conventions-c-11') 取该条四要素正文
```

**算过**：查得到条目，且条目带「时机 / 命令 / 期望」三要素（不必读 `package.json` 猜）。

## UC-2 按规范自证：改完把命令跑一遍 `serves: FR-1, FR-5`

```
改 src/client/views/knowledge.ts
   |
   +--> pnpm build:client
   |      期望：[verify-client] OK … 样式归属章在场, CSS 分片完整
   |      失败 --> 按条目「失败怎么办」找 C-05 / 检查样式分片收尾
   |
   +--> 把命令与输出摘要写进任务汇报（reqboard_task_report 的 completed）
```

**算过**：命令退出码 0，且输出含条目「期望」里的锚点。

## UC-3 收尾沉淀：缺什么，机器报、脚本填骨架、人补最后一笔 `serves: FR-3, FR-4`

```
需求收尾（归档材料提交前）
   |
   +--> npx tsx scripts/kb-probe.mts --json
   |      K10：缺 build:client（未见条目）  <-- 缺口清单，机器可读
   |
   +--> npx tsx scripts/kb-conventions-sync.mts --write
   |      为缺口生成骨架：### C-12 改了客户端必须重建 bundle #c-12
   |         - 时机：改动后        （映射表）
   |         - 命令：`pnpm build:client`
   |         - 期望：`[verify-client] OK …`
   |         - 失败怎么办：（待补：写清失败信号与修复位置）
   |
   +--> Agent 补「失败怎么办」+ 登记索引行
   |
   +--> npx tsx scripts/kb-probe.mts      ==> 九项 + K10 全过（缺一即红）
```

**算过**：`kb-probe` 退出码 0；`docs/knowledge/INDEX.md` 的 `## 规范` 节多出对应行。

## UC-4 新增脚本被拦：不写规范就过不了门禁 `serves: FR-4`

```
有人加了 scripts/new-thing.mjs 并挂进 package.json
   |
   +--> pnpm run kb:check
          K10 红：缺 pnpm new:thing（未见条目）
   |
   +--> 要么把它写进规范页（补条目 + 索引行），要么加进 EXCLUDED 并写明理由
```

**算过**：两种合法收口都能让 `kb:check` 转绿；"视而不见"过不去（无警告放过）。

## UC-5 发版前逐条过 `serves: FR-1, FR-2`

```
发版前
   |
   +--> reqboard_kb(kind='standard', query='发版')
   |      返回：C-17 发版前构建与类型检查 / C-18 同步镜像仓库
   |
   +--> 按「时机=发版前」的条目逐条跑：
          pnpm build && pnpm typecheck
          bash scripts/sync-to-github.sh
   |
   +--> 全过 → 发版；任一失败 → 按条目「失败怎么办」处理
```

**算过**：发版前清单里的命令**全部来自规范页**（不是临时想起），且每条都能追到 `C-NN`。

## 用例与功能点对照 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 用例 | 主要功能点 | 关键断言 |
|---|---|---|
| UC-1 查规范 | FR-1, FR-2, FR-6 | A1、A2（条目齐、命令可跑） |
| UC-2 自证 | FR-1, FR-5 | A2、A4（提示词有"自证"句） |
| UC-3 收尾沉淀 | FR-3, FR-4 | A5、A6（沉淀发生 + 缺校验即红） |
| UC-4 新增脚本被拦 | FR-4 | A3（覆盖度检查） |
| UC-5 发版前过 | FR-1, FR-2 | A1、A2 |
