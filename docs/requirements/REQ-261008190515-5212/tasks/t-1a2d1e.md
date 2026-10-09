# t-1a2d1e 让 implementing 退出 vendor 镜像表

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
让 implementing 退出 vendor 镜像表

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① `node -e "import('./scripts/inline-prompt-fragments.mjs').then(m=>console.log(Object.keys(m.VENDOR_MAIN_SKILLS).join(',')))"` 输出恰为 `accepting,archived`；② `grep -c "executing-plans" scripts/inline-prompt-fragments.mjs tests/prompt-tiers.test.ts` 两文件计数均为 0；③ `npx vitest run tests/prompt-tiers.test.ts` 全绿（④ 组只剩 2 条）

## 实施方案（implementation）
改 `scripts/inline-prompt-fragments.mjs`：从 `VENDOR_MAIN_SKILLS` 删掉 `implementing` 一项（第 68~72 行），并在文件头注释追加 2026-10-08 裁定与理由（上游 inline 执行模式与本仓任务卡 + 子代理模式冲突）。同步改 `tests/prompt-tiers.test.ts` 的同源副本（第 32~38 行）与 ④ 组注释：副本由 3 项改 2 项。两处必须同批落地（分叉即门禁与测试口径不一）。步骤：① 改脚本；② 立即改测试副本；③ 跑 `npx vitest run tests/prompt-tiers.test.ts` 确认 ④ 组只剩 2 条。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-08T11:18:03.089Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

把 implementing 从 VENDOR_MAIN_SKILLS 移出，脚本与测试同源副本同批落地；映射表只剩 accepting 与 archived 两项，该节点 heavy 不再被要求与上游原文逐字节一致

### 完成项

- 删掉 scripts/inline-prompt-fragments.mjs 里 VENDOR_MAIN_SKILLS 的 implementing 映射项
- 头注释补 2026-10-08 裁定与理由（上游 inline 专版明说不派子代理，与本仓任务卡加子代理模式相冲）
- 同步删掉 tests/prompt-tiers.test.ts 的同源副本项，注释同批对齐
- 历史 skill 名字改为指向 ATTRIBUTION 档案，保证判据②字面为 0 且审计链不断
- 验收①：node -e 打印映射 keys = accepting,archived
- 验收②：grep -c executing-plans 两文件均为 0
- 验收③：npx vitest run tests/prompt-tiers.test.ts 37 passed（④ 组只剩 2 条）

### 改动文件

- `scripts/inline-prompt-fragments.mjs`
- `tests/prompt-tiers.test.ts`

### 下一步

继续 ready 卡：t-ed16b0（项目说明书新增本仓实施模式节）与 t-124acb（heavy 主档改写自写完整档）

---
