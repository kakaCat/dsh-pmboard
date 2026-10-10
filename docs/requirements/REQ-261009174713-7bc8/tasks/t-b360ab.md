# t-b360ab 工具层单包 tool-pmboard·复核

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
工具层单包 tool-pmboard·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261009174713-7bc8/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-09T16:48:01.529Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

复核结论：无偏离。结构与设计表逐项对上、四目录边界由门禁守住、根包只经聚合面消费、工具名与 schema 等价（43 例绿）。

### 完成项

- 结构核对（对设计包表）：src 下为 kit/intake/decompose/verify/collab + registry.ts + index.ts；四目录文件数 20/17/9/8、kit 2
- 边界核对：node scripts/package-boundary-check.mts exit 0——四目录之间零横向引用（规则上仍只允许经 kit/）
- 聚合面核对：根包 src 从工具包只 import 'tool-pmboard/index.js' 一个入口（符合「根包只消费聚合面」）
- 工具面等价：tests/tools-schema 与 tests/tools-dispatch 共 43 例全绿（19 名与 schema 未变）
- 读数复核：全量 7268 例失败 19 = 基准（新增失败 0）；prompts:check 缺口 0；探针 agent 文案面 60 份与搬迁前同值
- 口径备注：卡面「TOOL_REGISTRY 聚合哈希与基线一致」不可达（基线 hash 含路径），已以「19 key 对齐 + schema 用例全绿」等价核对；「vitest run packages/tool-pmboard/tests」待 t20

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/tool-pmboard/src/registry.ts`
- `.worktrees/req-261009174713-7bc8/src/tools`

### 下一步

交测试子卡 t-730d00。

---
