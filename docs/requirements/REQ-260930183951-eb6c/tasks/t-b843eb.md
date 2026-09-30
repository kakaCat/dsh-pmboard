# t-b843eb 前置修复：复原 4 个缺失模块 + 重建插件装载层 cordis.patch.yml·复核

> 需求：REQ-260930183951-eb6c 修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续

## 在做什么
前置修复：复原 4 个缺失模块 + 重建插件装载层 cordis.patch.yml·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

grep -c "//#region src/application/internal/auto-confirm.ts" dist/index.mjs ≥ 1（复原内容与构建产物同源可查）；grep -n "triggerAutoConfirm" src/application/internal/auto-confirm.ts 命中；npx tsc --noEmit 2>&1 | grep -c "error TS" ≤ 213

## 汇报 1（2026-09-30T12:25:50.692Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

复核结论：无偏离——复原是逐字对齐构建产物的「恢复缺文件」，不是新写功能；唯一需要如实声明的是这次事故本身与本需求四个 FR 无因果关系。

### 完成项

- 无偏离：4 个模块均按 dist 构建内的 //#region 源码段逐字复原，未改调用方、未改语义、未改 dist
- 无偏离：cordis.patch.yml 按同 profile 内 dsh-notice-webhook 的同一约定书写（insert 行），并如实记录「该文件从未进 git、GitHub 亦无，属不可恢复重建」
- 一处如实声明：插件加载层缺失导致的工具消失，与本需求 FR-1~FR-4 无因果，属独立事故，已在留证中单列（repair-2026-09-30.md）

### 下一步

测试段：把该前置修复的验证命令与结果固化为可复核证据。

---
