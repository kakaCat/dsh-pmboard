# t-c9cb2c 看板扫描不再拿全部项目的清单用同一个目录去扫·联调

> 需求：REQ-261001203710-0fbf 计划落库未按需求工作区校正根：queue.json 与任务卡被写进另一个工作区

## 在做什么
看板扫描不再拿全部项目的清单用同一个目录去扫·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-01T13:42:56.778Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

联调通过：返回体扩字段对唯一调用点是透明的（它本来就丢弃返回值），扫描→补登链路在逐记录解析后仍然完整，跳过路径不写任何东西。这一步做完，什么变了——「改扫描的取数口径」不再需要同时改调用方，接口边界是干净的。

### 完成项

- 接口契约联调：syncAllReqArtifacts 返回体由裸 number 扩为 { scanned, skipped }，唯一调用点 src/http/routers/stages.ts 只 `await ... .catch(()=>{})` 并丢弃返回值 → 形状变更对它透明；npx tsc --noEmit 确认 stages.ts 零错误（未顺手让它消费 skipped，避免超范围）
- 链路联调（扫描 → 发现 → 登记）：project-scope.test.ts 的正向对照用例跑通「以 B 为当前项目 → 扫 B 自己的目录 → B 的记录被补登到 requirement.md（path = docs/requirements/REQ-000b02/requirement.md）」，证明逐记录解析后登记链路仍完整
- 跳过路径联调：同一次运行里 A 被计入 skipped（=1）且 A 的记录未被改写（零写入）
- 边界联调：未归属记录（无 workspaceRoot）走 cwd 兜底并单独成桶——已由 t1 的 partitionByProject 用例覆盖，本卡不重复造用例
- realpath 联调：适配器层注入 realpathSync，macOS 上 /var 与 /private/var 两种写法判为同一项目（避免把本项目的记录误判成「别人的」而漏扫）

### 改动文件

- `src/adapters/ArtifactSync.ts`

---
