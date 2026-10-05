# t-47ad9b 定契约：端口 + 设置解析纯函数 + SQLite DDL 常量 + 错误码映射

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
定契约：端口 + 设置解析纯函数 + SQLite DDL 常量 + 错误码映射

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/reqboard/settings-file.test.ts 全绿（设置文件>插件配置>env>默认 四态来源顺序；非整数/0/10001 被拒）；node 打印 resolveRunSettings 输出逐项 source 正确；npx tsc --noEmit 2>&1 | grep -c 'error TS' ≤ 开工基线。

## 实施方案（implementation）
新增 src/application/settings/resolve-settings.ts（四级来源合并 + 1–10000 校验 + 逐项 source 标注）、src/application/settings/events.ts（5 类系统事件载荷构造）、src/repositories/sqliteSchema.ts（DDL + sqlite_schema_version=1）；在 src/application/ports.ts 加 SettingsStore/SystemRecordStore 两端口（RequirementStore 签名不动）；改 src/http/envelope.ts 的 fail() 补登 confirmation_required→403、REQBOARD_REQUIRES_SQLITE_MIGRATION→503、window_opener_unavailable→503、dispatch_failed→502、migration_in_progress/sqlite_not_migrated→409。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T09:03:15.212Z，窗口 session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b）

这一步做完，运行设置的「形状」定死了：上限与后端各有四级来源（设置文件 > 插件配置 > 环境变量 > 内置默认）且逐项标注来源；非法值会被点名作废并沿链下探；系统记录成了只追加的事件流水（谁在什么时候改了什么，回滚后仍查得到）；SQLite 库结构有独立版本号。后续所有实现卡都按这套形状接线，不再各写一份。

### 完成项

- 新增设置解析纯函数：四级来源逐项判定 + 1–10000 校验 + 每项标注来源
- 定死一条容易写反的语义：非法值＝该项作废并沿链下探，不是整份回落默认，回落说明如实写出最终用了谁
- 新增系统记录事件模型：五类事件 + 只追加语义 + 派生字段（计数/当前后端/库快照）随事件自动随动
- 新增 SQLite 库结构常量：六张表 + 索引 + WAL PRAGMA + 独立的库版本号（与台账记录版本分开）
- 在端口层立两个新端口（设置读写、系统记录），既有需求存储端口签名一字未动
- 把 HTTP 错误码到状态码的映射收敛成一张表，并补登确认门 403、两种未就绪 503、投递失败 502、迁移中 409 等新码
- 新增 25 条单测：来源顺序四态、非法值作废与下探、环境变量逐项解析、后端切换需重启、系统记录追加与截断、陈旧库判定、库结构自洽
- 落盘开工基线：类型检查 146（存量，本次零新增）、相关域用例 1 失败 432 通过（那 1 条是既有的 ID 格式漂移，与本需求无关）

### 改动文件

- `src/application/settings/resolve-settings.ts`
- `src/application/settings/events.ts`
- `src/repositories/sqliteSchema.ts`
- `src/application/ports.ts`
- `src/domain/limits.ts`
- `src/http/envelope.ts`
- `tests/reqboard/settings-file.test.ts`
- `docs/requirements/REQ-261004103330-005f/notes/baseline.md`

### 下一步

进入批次 2：三个互不依赖的卡可并行——设置文件与系统记录适配器、SQLite 适配器、挂起确认机制扩写

---
