# REQ-261002140814-1a5d 测试用例设计 · 回执无损 + 留痕可见 `serves: FR-1, FR-2, FR-3`

> 全部落在**单元/集成层**（用真实 `JsonLedgerRepository` + 临时工作区，不起 HTTP、不开浏览器）。
> 本需求不改 HTTP 路由、不改客户端渲染代码，故无必交 E2E 自动化用例；端到端那一步是**人工确认**（需求文档 D7）。
> 反向用例与正向同等重要：**把修复退回去必须变红**，否则断言只是装饰。

## 1. 用例清单 `serves: FR-1, FR-2, FR-3`

| 编号 | 层级 | 覆盖 | 实际文件 | 命令 | 期望 |
|---|---|---|---|---|---|
| TC-1 | 单元 | FR-1 | `tests/clear-pause-lossless.test.ts` | `npx vitest run tests/clear-pause-lossless.test.ts -t UC-1` | UC-1：回执 `undefinedPaths(out)` 为空数组；`previous_activation === 'armed'`；台账 `activation='disarmed'`/`phase='idle'`/`version` +1 |
| TC-2 | 单元 | FR-1 | `tests/clear-pause-lossless.test.ts` | 同上 `-t UC-2` | UC-2：`hasOwnProperty('previous_activation') === false`（是省略，不是 undefined/null）；台账新建 dive 且 `roundsInStage=0` |
| TC-3 | 单元 | FR-1 | `tests/clear-pause-lossless.test.ts` | 同上 `-t UC-3` | UC-3：并发移除后 `rejects` 且 `error.code === 'REQBOARD_MUTATION_FAILED'`；**不**返回 success |
| TC-4 | 单元 | FR-1 | `tests/clear-pause-lossless.test.ts` | 同上 `-t UC-4` | UC-4：无绑定 → `REQBOARD_NO_BOUND_REQ`；非本窗口 id → `REQBOARD_NOT_BOUND_TO_WINDOW`；两者零写入（`version` 不变、comments 不增） |
| TC-5 | 单元 | FR-2 | `tests/clear-pause-lossless.test.ts` | 同上 `-t UC-5` | 留痕 `comments.at(-1).body` 含 `之前状态：armed`；该对象 `hasOwnProperty('text') === false`；`createdBy.sessionId === windowKey` |
| TC-6 | 反向（证伪） | FR-1, FR-2 | `tests/clear-pause-lossless.test.ts` | 同上 `-t 反向` | 构造"修前形状"的对象（`{ previous_activation: undefined }` / `{ text: '…' }`）喂给同一断言函数 ⇒ **必须报缺**（证明断言不是恒真） |
| TC-7 | 单元（门禁） | FR-3 | `tests/output-contract.test.ts` | `npx vitest run tests/output-contract.test.ts` | 值为 `undefined` 的属性被判红；既有全部工具（含本工具）成功路径仍绿 |
| TC-8 | 反向（门禁自检） | FR-3 | `tests/output-contract.test.ts` | 同上 | 故障注入：给真实工具源临时加未声明键 → 门禁必红（既有自检保持有效） |
| TC-9 | 回归 | FR-1, FR-2, FR-3 | — | `npx vitest run tests/tools-schema.test.ts tests/status-lossless.test.ts tests/apply-wiring.test.ts` | 全绿（工具 schema 构造、无损口径、注册清单未被扰动） |
| TC-10 | 静态 | FR-1 | `src/application/use-cases/ClearPause.ts` | `pnpm typecheck 2>&1 \| grep ClearPause` | 无输出（改前 6 条错误 → 0 条，C-15） |

## 2. 断言入口与夹具口径 `serves: FR-1, FR-2`

| 项 | 口径 |
|---|---|
| 无损扫描 | 复用 `tests/status-lossless.test.ts` 的 `undefinedPaths(v)`（递归列"值为 undefined 的属性"，与绑定层 `walkJsonValue` 同口径）；**不另造第二套** |
| 夹具 | 照 `tests/output-contract.test.ts` 的 `depsWith()`：真实 `JsonLedgerRepository` + `FileDocRepository` + `SystemClock` + `RandomIdFactory` + 临时目录；用例后 `rmSync` 清理 |
| 驱动方式 | 直调 `defineClearPauseTool(deps).execute(args, { agent: { id: W } })`（走工具壳，等于走真实入口与 `deps.session.windowKey`） |
| 文件头 | 首行注释 `// serves: FR-1, FR-2, FR-3`（`testFileHasServesHeader` 检查头 20 行） |
| 台账断言 | 用 `store.snapshot()` 读落盘后的需求记录（不读用例内部变量，避免自证） |

## 3. 反向证伪设计 `serves: FR-3`

| 反向项 | 怎么证伪 | 期望 |
|---|---|---|
| TC-6a 回执断言不是恒真 | 用 `{ success: true, requirement_id: 'REQ-x', previous_activation: undefined, message: '…' }` 喂断言 | 判红（命中 `previous_activation`） |
| TC-6b 留痕断言不是恒真 | 用 `{ id, text: '…', createdAt }` 喂"body 非空"断言 | 判红（`body === undefined`） |
| TC-7a 门禁不是恒真 | 向 `assertConformsToSchema` 喂 `{ declared_field: undefined }` | 判红（豁免删除前此处为绿——这正是缺陷溜过的原因） |
| TC-8 静态扫描仍然有效 | 既有故障注入用例（临时副本注入未声明键） | 差集非空 |

## 4. 执行与基线口径 `serves: FR-3`

| 约定 | 命令 | 期望 |
|---|---|---|
| C-14 提交前测试 | `pnpm test` | 失败数 ≤ 基线 106，**新增用例全绿** |
| C-15 类型检查 | `pnpm typecheck 2>&1 \| grep ClearPause` | 0 条（全仓其它文件历史错误不计） |
| C-11 发版前构建 | `pnpm build` | 退出码 0，`dist/index.mjs` 内 `previousActivation` 相关形状已更新（重启宿主后 D7 人工确认才有效） |

## 5. FR ↔ 用例覆盖 `serves: FR-1, FR-2, FR-3`

| 功能点 | 覆盖用例 |
|---|---|
| FR-1 回执无损 + 不说假成功 | TC-1、TC-2、TC-3、TC-4、TC-6a、TC-10 |
| FR-2 留痕写 `body` | TC-1（UC-1 留痕断言）、TC-5、TC-6b |
| FR-3 回归 + 门禁补洞 | TC-7、TC-8、TC-9 |
