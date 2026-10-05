# t-8faf50 太严可回退：闸门开关与装配期校验

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
太严可回退：闸门开关与装配期校验

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/archive-gate-config.test.ts 全绿（缺省 enforce / warn 合法 / 非法值装配期抛错且文案含字段名）；pnpm typecheck 错误数 ≤ 223。

## 实施方案（implementation）
src/plugin-config.ts 增 archive.unlistedGate 解析（缺省 enforce，非法值装配期抛错）；src/index.ts 装配注入；src/application/ports.ts 增可选字段。新增 tests/archive-gate-config.test.ts。

## 上游产出摘要（dependsSummary）
- 先把规矩定死：哪些文件不用进清单、对账结果长什么样

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T10:46:48.276Z，窗口 session-a1f04215-5a72-4eb9-8633-2259d055f3a3）

这一步做完，这次行为变更不至于变成"只能往前"的单行道：一个开关就能退回旧行为，配错了还会当场报错。

### 完成项

- 闸门开关落地（缺省 enforce / warn 回退 / 非法值装配期抛错）
- 组合根注入，与既有配置同风格
- 3 条配置用例全绿；类型检查优于基线
- 整卡四段子卡链完成

### 改动文件

- `src/plugin-config.ts`
- `src/index.ts`
- `tests/archive-gate-config.test.ts`

### 下一步

t6：迁移与兼容（存量记录、旧字段、warn 回退验证）。

---
