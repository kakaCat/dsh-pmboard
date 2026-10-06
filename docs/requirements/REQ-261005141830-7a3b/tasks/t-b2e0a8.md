# t-b2e0a8 立项目身份底座：注册表端口 + 三个纯函数·研发

> 需求：REQ-261005141830-7a3b 修复 Dive 项目归属以路径判定：改用项目 id 唯一标识

## 在做什么
立项目身份底座：注册表端口 + 三个纯函数·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T06:47:23.965Z，窗口 session-5ae0ddcc-04c0-4c3e-8ef0-86661f9234aa）

这一步做完，项目身份的底座可用了：会话能查出自己属于哪个项目，项目能查出根在哪，而「是不是同一个项目」从此只问一个函数——以前这件事要靠比路径字符串，软链和尾斜杠都能把同一个项目判成两个。

### 完成项

- 新增项目身份判定的唯一口径模块（会话→项目、项目→根、同一项目判据）
- 新增项目注册表端口的 application 声明与 adapters 唯一实现（三态不猜）
- 路径纯函数独立成模块，support.ts 继续再导出（既有 import 不变）
- 开窗落点的行扫描改为调用共用实现
- 新增用例文件并跑通 T-01~T-07

### 改动文件

- `src/application/internal/project-identity.ts`
- `src/application/internal/project-root.ts`
- `src/adapters/workspaceRegistryRows.ts`
- `src/adapters/WorkspaceRegistryProjectPort.ts`
- `src/application/ports.ts`
- `src/application/internal/support.ts`
- `src/adapters/SessionWindowOpener.ts`
- `tests/project-identity.test.ts`

### 下一步

联调：确认两条消费路径（项目身份端口与开窗落点）对同一份注册表结论一致。

---
