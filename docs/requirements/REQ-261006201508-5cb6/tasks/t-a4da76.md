# t-a4da76 新增 README 工具面校验用例

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
新增 README 工具面校验用例

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① pnpm vitest run tests/readme-tool-face.test.ts 全绿；② 逆验证：临时从 README 删掉 reqboard_kb 那一行 → 该用例红且失败消息含 reqboard_kb，还原后复绿；③ 逆验证：临时加一行工具名 reqboard_advance → 红且消息点名该名，还原后复绿；④ 用例源码内不出现字面量 27 作为断言常量。

## 实施方案（implementation）
新建 tests/readme-tool-face.test.ts：读 README.md 与 package.json 文本；抽名字集合（正则 /`(reqboard_[a-z_]+)`/g 全文扫）、表头计数（/## 提供的工具（(\d+) 个）/）、表内行数（行匹配 /^\| `reqboard_/ 计数）；期望值全部从 TOOL_REGISTRY 派生（names = map(toolName)、count = length），禁止出现字面量 27 参与比较；断言双向差集为空、declared === rows === count、无「13 个」「21 个」残留、`${count} 个` 在 README 出现 ≥3 次且在 package.json description 出现 ≥1 次；失败消息逐条点名（README 缺：… / README 多：… / 登记面 N 条 / README 写 M 个 / 表内 K 行）。读文件用 node:fs + node:url，手法参照 tests/apply-wiring.test.ts。契约与失败消息形态见 design/interfaces.md 第 4 节。

## 上游产出摘要（dependsSummary）
- 按登记面重写 README 工具表并校准计数

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T12:47:12.015Z，窗口 session-be51186a-1e9c-49ba-8c20-144c14c224aa）

t3 完成：README 工具面有了会红的守卫——集合、计数、行级名字三路断言 + 反向自检防写死，两条逆验证按点名要求红且还原逐字节一致。

### 完成项

- 新建 tests/readme-tool-face.test.ts（5 条用例），README 工具面与登记面绑成可跑断言
- 验收①正向 5 passed；②删行 → 红且点名 reqboard_kb；③加幽灵名 → 红且点名 reqboard_advance；④源码无字面量计数
- 两条逆验证均以 md5 校验还原：README 逐字节一致，还原后复绿
- 子卡链 3/3 完成：研发（t-545020）、复核（t-ffd628）、测试（t-ea8989）均已汇报并关闭
- 复核段另发现一处契约加强（行级点名消息），已登记为超集而非偏离
- 跨卡回归：工具面三文件 53 passed；全量套件的 82 条红经逐条归属核查，无一条落在本需求改动上

### 改动文件

- `tests/readme-tool-face.test.ts`

### 下一步

开工 t4（t-256bec）：新增 tests/registry-log.test.ts，把装配期注册日志与登记面绑成断言

---
