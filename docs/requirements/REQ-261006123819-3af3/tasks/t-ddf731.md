# t-ddf731 工具登记面单点化并补齐 4 条缺失映射·研发

> 需求：REQ-261006123819-3af3 审计优化·前 5 条落地（提交工作树 / 契约映射 / 基线口径 / 死字段 / 知识层自检）

## 在做什么
工具登记面单点化并补齐 4 条缺失映射·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T05:40:36.745Z，窗口 session-af0ee362-fa98-4396-a5d7-856681a42843）

研发段：登记面落到 src/tools/registry.ts 一处，三处清单改为派生，4 条缺失映射与两条安全网断言全部就位。

### 完成项

- 新增 src/tools/registry.ts：导出 ToolRegistryEntry 与 TOOL_REGISTRY，27 条
- 字段齐备：key / factoryFile / dir / toolName / responseSources
- 4 条缺失映射补齐：AdoptTask、QueryKnowledge、RegenerateChain、InstallSkills
- SkillInstall 额外登记工厂文件（execute 的 catch 内联 return）
- output-contract 删掉手写 RESPONSE_SOURCES，改为遍历 TOOL_REGISTRY
- 加安全网一：正则扫到的工厂必须都在 registry（未登记即红并点名）
- 加安全网二：registry 逐条工厂文件存在且导出 define<key>Tool
- tools-dispatch 目录清单改由 registry.dir 派生（与磁盘集合相等）
- apply-wiring 注册名单改由 registry.toolName 派生，补上 reqboard_skill_install
- 本卡未动工厂扫描正则（按卡要求留给 t3）

### 改动文件

- `src/tools/registry.ts`
- `tests/output-contract.test.ts`
- `tests/tools-dispatch.test.ts`
- `tests/apply-wiring.test.ts`

### 下一步

交复核子卡（t-8c33a3）逐条对照 design/interfaces.md 与 design/backend.md。

---
