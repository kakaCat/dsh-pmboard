# t-61de2a 客户端深链消费：清 hash → 定位 → 切面板·复核

> 需求：REQ-261004111917-f473 修复看板/需求详情深链 404：/dashboard#pmboard 已失效，补兼容路由 + 前端定位

## 在做什么
客户端深链消费：清 hash → 定位 → 切面板·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T03:42:46.111Z，窗口 session-168fa441-ba3a-45f8-9240-cfa416e2a4ec）

复核段结论：契约与不变量逐条一致，但复核揪出 6 条（含 1 条中危重试预算、1 条 I-8 结构缺口、1 条会误清他源意图），全部当场修掉或收口，并补了 4 条护栏用例与 3 组反向演练。

### 完成项

- 复核方式：第二个独立子代理只读复核（对照 interfaces.md §客户端模块契约 + data-model.md 的 I-1~I-10 + UC-3/UC-4），并额外检索应用包内框架文档确认 selectPanel 的重复选中语义
- 结论：解析规则、时序不变量、重试兜底、接线位置、耦合与路径冲突均一致——带条件放行
- 复核 #1 重试预算（中）：原 10×16ms≈144ms 无依据 → 改为 40×16ms≈640ms（导出 DEFAULT_MAX_ATTEMPTS + 依据注释），并补用例锁死预算下界（≥500ms）；真实时延由 t5 端到端量测后定值
- 复核 #3 I-8 结构缺口：解析与参数归一路径原在 try 之外，传 null 会 reject → 整个函数体纳入 try、端口调用全部可选链，并补用例（ports=null 也必须 resolves 'failed' 而非 reject）
- 复核 #4 口径冲突（req= 空值）：实现向文档多数收口——「写了 req 却空值」判 malformed，「根本没写 req」才是 ok 缺省；补一条区分用例；三处文档（interfaces §解析规则 / test-cases TC-3 / use-cases UC-4）与实现由此一致，无需改写已确认的设计文档
- 复核 #5 layout 错误矩阵不一致：接线改为先判 ctx.layout === undefined → 打契约里那条专属诊断并跳过消费（省掉一整轮无谓重试），与 interfaces.md 的降级表逐字对齐
- 复核 #6 误清他源意图：失败兜底改为只在「本次登记过定位」时才 clearFocus，并补用例（无 reqId + 选择失败 → clearFocus 调用 0 次）
- 复核 #7/#8 记账：maxAttempts 的非正/非有限值回落缺省已写进 JSDoc；clearHash 失败日志改为点名「该链接刷新后可能再消费一次」
- 反向演练（改完即撤，sha256 逐字节还原 31345de7…）：删 clearHash → 4 红；把 requestFocus 挪到 selectPanel 之后 → 5 红；失败不清意图 → 3 红；还原后 21/21 全绿
- UC-3 归属已澄清并记账：本卡单独交付只覆盖「冷启动、面板尚未挂载」顺序；「人已站在看板上即时定位」是 t3 订阅通道 + t5 端到端的账——验收材料不得把该条记在本卡

### 改动文件

- `src/client/deep-link.ts`
- `src/client/index.ts`
- `tests/deep-link.test.ts`

### 下一步

交测试段：全量回归 + tsc 基线 + build:client 产物取证。

---
