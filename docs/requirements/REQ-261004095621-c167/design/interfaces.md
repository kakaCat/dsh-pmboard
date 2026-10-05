---
requirement_refs: [FR-1, FR-2, FR-3]
---

# 接口设计（REQ-261004095621-c167） <!-- serves: FR-1, FR-2, FR-3 -->

## 本期新增接口：无 `serves: FR-2`

- **结论**：本期不新增任何 HTTP / RPC / 工具接口，不新增宿主路由，不新增客户端插桩点。
- **原因**：FR-2 的前置假设（"桌面端取不到控制台"）被本回合事实推翻——用户已直接取到崩溃原文；
  现有三步取证法已足够定位（见下节），自建通道的边际收益不抵成本（宿主路由 + 重启 + 落盘文件 + 测试）。
- **代价**：无接口 = 无契约负担、无版本兼容问题、无安全面扩大。

## 取证接口（运维口径：命令 → 观察 → 判据） `serves: FR-1`

| 步 | 输入（命令/操作） | 输出（观察项） | 判据 |
|---|---|---|---|
| 1 | `cordis_inspect_query(client / Slots / listSubTree, {root:"conversation.input.model"})` | `selected.occupants[0].active`、`registrant` | `active:false` = 席位**已退役**（崩过）；`registrant` 指认归属 |
| 2 | 控制台（DevTools）复现一次 | `slot entry crashed in '<slot>': <error>` + 堆栈 | 拿到崩溃**原文**（本案例：React `#130`、`args[]=undefined`） |
| 3 | `npm pack <pkg>@<ver>` → 与 app.asar 内同名文件逐符号对标 | 符号缺失清单 | 有缺失 = 安装**自相矛盾**（本案例：primitives 缺 `MenuGroup`） |

## 端到端判定接口（修复是否生效） `serves: FR-3`

- **调用**：`Slots.listSubTree(root='conversation.input.model')`
- **输入**：`{ root: string }`（席位键）
- **输出**：`selected.occupants[] = { registrant?, priority, active }`
- **判定**：`occupants[0].active === true` 且**连点模型控件 3 次**后复查仍为 `true` → 修复生效；
  出现 `active:false` → 仍会退役，回到取证步 2/3。
- **错误语义**：`requestedRoot.available=false` = 席位未声明（该会话未挂编辑器），不算失败，换会话重试。

## 将来若实施 FR-2 的接口契约（本期不落地、不承诺） `serves: FR-2`

| 项 | 契约 |
|---|---|
| 端点 | `POST /dashboard/api/reqboard/client-error` |
| 请求体 | `{ ts:number, slot:string, registrant?:string, message:string, stack?:string, url:string, truncated?:boolean }` |
| 响应 | `200 {ok:true, file:string, bytes:number}`；`400` 非法 JSON；单条 >16KB 截断并置 `truncated:true` |
| 落盘 | `~/.dsh/state/pm-client-render-errors.jsonl`（append-only；单文件 ≤1MB，滚动保留 3 份） |
| 失败语义 | 通道自身任何失败只 `console.warn` + 计数，绝不影响 UI |
