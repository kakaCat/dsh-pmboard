# 设计 · 架构（REQ-261005143615-5ab1） `serves: FR-1, FR-2, FR-3, FR-5`

## 目标与总体方案 `serves: FR-1, FR-2`

把「登记文档在不在盘上」的判据从**阅读会话的工作区根**改成**需求自己声明的工作区根**；
判存在与算绝对路径都走同一处读根解析，解析不到根时如实说「未判定」而不是「缺失」。

```
GET /requirements/:id/docs
        |
        v
  store.get(id)  ──►  req.workspaceRoot（台账声明，第一候选）
        |
        v
  候选根（panels.ts 构造，按序、去重、只留存在的根）
    ① req.workspaceRoot
    ② ?session= 解析出的会话工作区
    ③ 组合根 cwd
        |
        +-- 逐条产物：按序问每个根的 docs.exists(path)
        |     命中 → state=confirmed|pending，absPath=docs.resolve(path)
        |     全不命中 且 候选根非空 → file-missing（诚实缺失）
        |     候选根为空（一个都不存在）→ unknown（未判定）
        v
  DocsResponse.documents[].{state, path, absPath}
```

## 读根候选与判定链 `serves: FR-2, FR-3`

| 环节 | 规则 | 理由 |
|---|---|---|
| 候选序 | 需求根 → 会话根 → cwd | 需求根是「这条需求的东西在哪」的唯一权威声明；会话根只是「谁在看」 |
| 候选过滤 | 只保留**目录真实存在**的根 | 「根不在」与「文件不在」是两件事，前者只能说未判定 |
| 命中即止 | 首个命中根算 absPath | 同一相对路径在多个根下都存在时，需求根优先（读与写同根） |
| 全不命中 | 候选非空 → `file-missing`；候选为空 → `unknown` | 保住既有的诚实缺失语义，同时堵住「一个根都没有还硬说缺失」 |

## 三态语义（unknown ≠ missing） `serves: FR-3`

- `confirmed` / `pending`：文件在（命中某个候选根）。
- `file-missing`：**至少一个候选根可用**，但逐根都没找到该文件——登记过、文件确实不在。
- `unknown`（新增）：一个候选根都不可用（换机器 / 仓被移动 / 会话与需求根都没了）——
  这台机器上判不了，页面必须这么说，不得写成缺失（同 `QueryDocs` 文件头②的既有纪律）。

## 落点（改哪些文件） `serves: FR-1, FR-2, FR-3, FR-4`

| 文件 | 改什么 |
|---|---|
| [contracts.ts](../../../../../src/application/query/contracts.ts) | `PanelQueryDeps` 加两个可选口：`docRootsOf?(req)` / `docsAt?(root)`（缺省 = 维持单根旧行为） |
| [panels.ts](../../../../../src/http/routers/panels.ts) | 构造并注入上面两口（候选序、`existsSync` 过滤；`docsAt` = `new FileDocRepository({ workspaceRoot: root })`） |
| [QueryDocs.ts](../../../../../src/application/query/QueryDocs.ts) | 逐条产物多根判定 + `absPath`；`generated` 与原型 INDEX 读取同根 |
| [protocol.ts](../../../../../src/shared/protocol.ts) | `DocPanelState` 增 `'unknown'`；`DocPanelEntry.absPath?`；`generated[].absPath?` |
| [panels/docs.ts](../../../../../src/client/views/panels/docs.ts) | 路径格显示绝对路径（附相对路径小字）、`unknown` 文案、划线只给 `file-missing` |

## 回滚 `serves: FR-5`

两口都可选：不装配 → 逐字节回到今天的行为（单根 + 无 `absPath` + 无 `unknown`）；
客户端对未知状态回落为「读根不可得」文案即可，无台账迁移、无数据回填。

## ASCII 关系图（给读者一眼看懂"谁在撒谎"） `serves: FR-1`

```
现状：阅读会话根 ──解析失败──► 插件宿主目录（无 docs/） ──► 25/25 file-missing ✗
改后：需求声明根 ──命中──► absPath + confirmed/pending ✓
                 └─全不可用─► unknown（未判定，不撒谎）✓
```
