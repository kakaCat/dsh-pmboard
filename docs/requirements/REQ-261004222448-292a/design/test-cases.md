# 测试用例（REQ-261004222448-292a）

<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15 -->

> 三层：**单元/用例层**（vitest，纯函数）· **渲染断言层**（vitest，断言 HTML 字符串）· **探针层**（headless Chrome，真实渲染）。
> 验收口径引用本仓规范：改客户端必重建 `conventions.md#c-12`、提交前跑测试 `#c-14`、改源码必类型检查 `#c-15`、发版前构建 `#c-11`。

## 分层与命令 `serves: FR-11`

| 层 | 命令 | 期望 |
|---|---|---|
| 单元 | `pnpm test`（`#c-14`） | 全绿；新增用例见下表 |
| 类型 | `pnpm typecheck`（`#c-15`） | 退出码 0 |
| 客户端构建 | `pnpm build:client`（`#c-12`） | `[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| 全量构建 | `pnpm build`（`#c-11`） | `dist/` 与 `lib/client.js` 都有新产物 |
| 渲染探针 | `npx tsx scripts/req-report-probe.mts`（**新增**） | 退出码 0；失败打印具体档位/断言 |

## T-1 ~ T-8：取数架构与性能 `serves: FR-11`

| 编号 | 断言 | 命令 | 期望 |
|---|---|---|---|
| T-1 | **首屏只有 1 个请求且不含正文**（记 `fetch` 调用）；`trunk` 随默认 Tab 发出，共 2 个 | 渲染断言 + mock fetch | 无第三请求；响应体不含 `text`/文档正文 |
| T-2 | **切 Tab 才产生该 Tab 的请求**：初始不请求 `dialogue`/`token`/`prompts`；点了才请求 | 同上（请求计数） | 未点的 Tab 请求数 = 0 |
| T-3 | **未激活 Tab 面板不在 DOM** | 渲染断言 | `document.querySelector('[data-panel="token"]')` 在未激活时为 `null` |
| T-4 | **无内层滚动容器** | 探针扫描 | 面板内 `overflow: auto\|scroll` 命中数 = 0 |
| T-5 | **列表铺开**：文档行数 == 台账文档数；核验行数 == 验收项数 | 渲染断言 | 15 == 15、12 == 12（不截断、不折叠成一行） |
| T-6 | **局部更新保态**：模拟一次 SSE revision 变更后，滚动位置 / 展开态 / 当前 Tab 不变 | 渲染断言（轻 DOM） | 三者均不变 |
| T-7 | 分页：`dialogue` 默认 20 条 + `hasMore`；`before` 取更早 | 用例层 | 条数与游标正确 |
| T-8 | Tab 角标数字来自服务端计数（不前端遍历） | 渲染断言 | 角标 == 响应里的 `count` |

## T-9 ~ T-14：内容正确性（含"不许编"） `serves: FR-1, FR-2, FR-6, FR-7, FR-10, FR-14, FR-15`

| 编号 | 断言 | 期望 |
|---|---|---|
| T-9 | **主干抽取**：七条各带 `source`；文档缺节 → `missing:'doc-section-missing'`，页面渲染「文档未提供该节」 | 缺节标本不出现编造文案 |
| T-10 | 「设计模式」无内容时渲染 `未使用`（不硬凑） | 断言字符串存在 |
| T-11 | **亮点无证据**：`highlights[].evidence` 为空 → 渲染「**未提供证据（不计入亮点）**」 | 且**不得**出现在正常亮点样式中 |
| T-12 | **对话过滤**：响应与渲染产物中**不含** `tool/call`、`tool/result`、`reasoning`、`run_code` 字样；系统消息与人类消息同容器按时间序 | 反例断言（含任一即失败） |
| T-13 | **核验表三列在**：实际结果 / 来源（agent\|human）/ 需人工（照抄现有列） | 三列缺一即失败 |
| T-14 | **Token 按阶段**：占比合计 == 总计；存在 `perCallTokens` 与 `cacheHitPct` 两列；优化点每条含数字 | 缺列即不满足「可优化数据」 |

## T-15 ~ T-19：降级与诚实空态 `serves: FR-12`

| 编号 | 触发 | 期望 |
|---|---|---|
| T-15 | 端口未装配（`available:false, reason:'port-unavailable'`） | 显示「不可用（端口未装配）」；**不得**出现 `0 条 / 0 次` |
| T-16 | 文档登记但文件不在（`state:'file-missing'`） | 路径划线 + 「文件缺失」（对标现有 `doc-missing` 标灰） |
| T-17 | 无 token 快照（`availability:'none'`） | 「无 token 快照」；`partial` → 「部分数据（下界）」并列出 `missingStages` |
| T-18 | 旧留痕缺新字段（`origin:'unknown'`, `delivered:null`） | 「来源未知 / 投递不可知」；**不得**默认成"已投递" |
| T-19 | 反例总断言 | 页面任何位置**不得**用 `0` 表示"未知 / 未采集" |

## T-20 ~ T-22：留痕与模板 `serves: FR-9, FR-13`

| 编号 | 断言 | 命令/方式 |
|---|---|---|
| T-20 | `createRoundMessage` 投递后留痕 **+1** 且 `origin:'dive-round'`、`text` 非空；投递失败时留痕记失败原因且 `delivered:false` | 单元测试（mock deliverer） |
| T-21 | `text` 超 8 000 字符被截断且 `truncated:true`（页面显示"已截断"） | 单元测试 |
| T-22 | 设计模板与需求模板含「关键决策与取舍」「技术方案与亮点」两节；模板渲染产物含两节 | 模板断言（现有测试目录） |

## 探针：真实渲染断言（新增脚本） `serves: FR-11, FR-12`

`scripts/req-report-probe.mts`（仿 `scripts/list-responsive-probe.mts`：真实 render + 真实 CSS + headless Chrome）：

| 档 | 组合 | 断言 |
|---|---|---|
| 宽 1280 × {在途, 终态} | 详情页 | ① 首屏四问可答（结论头/操作条/缺口在首屏内）；② 无横向溢出（`scrollW == viewport`）；③ 无内层滚动容器；④ Tab 面板仅一个在 DOM |
| 窄 900 × {在途, 终态} | 详情页 | ① 三档退化为单栏且不溢出；② 操作条按钮不重叠（包围盒两两不相交） |
| 档一 / 档二 | 会话头部 / 面板 | 档二**不含**文档表、成本、提示词正文（断言选择器为 `null`） |

退出码：`0` 全过；`1` 有断言失败；`2` 环境不可用（找不到 Chrome——**响亮失败，不静默跳过**）。

## 回归红线（现有用例必须继续绿） `serves: FR-7, FR-8, FR-9`

| 现有能力 | 守护用例（不得改红） |
|---|---|
| `jump-session` 五态与已归档恢复 | 现有 session-jump 用例 |
| `open-doc` 存在性预检 / `doc-missing` | 现有 doc 用例 |
| DAG 视图状态记忆 | `dag/view-state` 用例 |
| 评论草稿保持 | `captureDetailDraft` 用例 |
| 「无快照不补 0」 | `token-info` 用例 |
| 台账双后端一致性 | 现有 `RequirementStore` 共享用例（新增读取必须两条腿都跑同一组） |

## 手工验收步骤（人做，一次） `serves: FR-3, FR-11`

1. `pnpm build && pnpm build:client` → 重启 GUI → 打开任一需求详情；
2. 观察：首屏无需滚动即可见 结论头 / 操作条 / 缺口；点六个 Tab 各一次，**每个 Tab 只在点击后发请求**（Network 面板核对）；
3. 展开「提示词 → 某一段正文」，**保持展开**，触发一次台账变更（让 agent 动一下或改注释）→ **正文仍展开、滚动位置不变**；
4. 检查：任何列表都**没有内层滚动条**（只有页面滚动条）。
