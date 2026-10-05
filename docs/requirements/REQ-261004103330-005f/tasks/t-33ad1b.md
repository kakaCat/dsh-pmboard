# t-33ad1b 端到端与反向演练 + 开工基线落盘

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
端到端与反向演练 + 开工基线落盘

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
npx vitest run tests/reqboard/settings-e2e.test.ts 全绿；三条反向演练逐条验证『移除对应处置后该用例必红』并记录实测；npx vitest run tests/reqboard tests/application tests/http 失败数 ≤ 基线；npx tsc --noEmit 2>&1 | grep -c 'error TS' ≤ 基线。

## 实施方案（implementation）
新增 tests/reqboard/settings-e2e.test.ts 串三条端到端（上限改 5 → 假投递驱动到 5 即停手；确认门 → 票据 → 迁移 → 设置写入 → 重启后 SQLite 生效；未迁移重启 → 503 指引）+ 三条反向演练（移除回滚分支 / 写反优先级 / 删留痕校验，各自必红）；把开工基线写进 docs/requirements/REQ-261004103330-005f/notes/baseline.md。

## 上游产出摘要（dependsSummary）
- 上限生效：同步快照 + 默认表降级 + 判定点停手
- 迁移开窗链路：windowOpener + crossWindowDeliver + 系统事件
- 运行上限屏（表格 / 草稿态 / 校验 / 来源徽章 / 泳道上限）
- 存储与数据库屏 + 确认门（四态机 / 票据 / 独立错误文案）
- 系统记录屏 + 通用屏（时间线 / 路径档案 / 版本核对 / 分叉红字）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T10:11:48.693Z，窗口 session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b）

这张卡做完，「三件事各自都对、接起来是断的」这种最坏的失败方式被挡住了一次——而且它同时交付了三条端到端链条与三条"删掉防线必红"的实证，让"这些防线真的在挡东西"这句话有了证据而不是信心。

### 完成项

- 三条端到端建立：上限从设置文件一路生效到当拍停手；真迁移 → 库 → 重启装配用库读；未迁移重启拒服务且不返回空册
- 端到端抓出整条需求最要紧的缺陷（切库后重启生效此前是假承诺）并修复：构造期同步读一次盘灌初值
- 三条反向演练逐条「红 → 恢复 → 绿」，其中删源头否定校验的演练证明两道防线各自独立
- 连带修掉两处类型说谎（票据过期时刻类型、两个前端夹具未跟上动作扩充）
- 基线文件补齐收口实测四节，数字与归因逐条可复核
- 全程手工编辑恢复，未用任何宽范围 git 命令（工作区压着其它窗口数百个未提交改动）

### 改动文件

- `tests/reqboard/settings-e2e.test.ts`
- `src/adapters/FileSettingsStore.ts`
- `src/client/settings/types.ts`
- `tests/settings-dialog.test.ts`
- `tests/settings-storage.test.ts`
- `docs/requirements/REQ-261004103330-005f/notes/baseline.md`

### 下一步

提交验收材料（reqboard_submit kind=verification）

---
