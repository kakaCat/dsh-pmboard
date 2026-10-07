# t-ae406c 迁移兼容、存量不追溯与全量回归收口·研发

> 需求：REQ-261006201920-2adc 让验收不再形式合规：堵住占位符验收与空事实裁决

## 在做什么
迁移兼容、存量不追溯与全量回归收口·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T13:30:15.569Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

研发段交付：兼容三形态 7 例全绿、两份证据落盘；三处偏差已响亮报出并逐条归属，根因是运行进程加载旧 bundle。

### 完成项

- 新增 tests/acceptance-compat.test.ts（7 例）：三形态各覆盖，含一组「开关关闭时才写」的对照，证明「开关下不写」不是恒不写
- 落证据 docs/requirements/REQ-261006201920-2adc/evidence/compat-and-baseline.md（90 行）：差集、类型门、构建门读数 + 逐条归属 + 全部验证入口一览
- 落证据 docs/requirements/REQ-261006201920-2adc/evidence/legacy-cards-untouched.md（81 行）：存量零改写三命令交叉验证 + 占位符计数变化的根因
- 目标命令全绿：npx vitest run tests/acceptance-compat.test.ts → 1 file / 7 tests passed，exit 0
- pnpm build → [verify-client] OK，exit 0
- **响亮报出三处偏差（都已逐条归属，不静默）**：② baseline:check exit 1（差集 14 条新增，逐条确认非本次引入：3 条顺序相关、11 条在别的窗口在飞文件或会话开始时基线已红）；③ 全仓 tsc 4 条（基线 0），全在别人的测试文件，本需求改动面 0 条；⑤ 占位符计数 944 → 1020（不是改写存量——git diff 为空、被改存量卡 0 条，是新增 133 张卡，由**加载了旧 bundle 的运行进程**所落）
- **根因（本轮最有价值的发现）**：reqboard 插件加载构建产物且在宿主启动时入内存——本会话改 src 与重跑 build 都不会让当前进程生效，故本会话新落的卡（含我这个需求的子卡）仍带模板占位符
- 刻意**不跑 baseline --refresh**：红线要求不碰测试基线，且那些失败是别的窗口在飞状态，刷基线等于把别人的破绽记成现状

### 改动文件

- `tests/acceptance-compat.test.ts`
- `docs/requirements/REQ-261006201920-2adc/evidence/compat-and-baseline.md`
- `docs/requirements/REQ-261006201920-2adc/evidence/legacy-cards-untouched.md`

### 下一步

进入 t6 复核段：核对证据文件的读数与命令输出逐字一致、归属逐条可复核

---
