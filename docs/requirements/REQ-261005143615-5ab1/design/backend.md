# 设计 · 服务端（REQ-261005143615-5ab1） `serves: FR-1, FR-2, FR-3`

## 端口注入（应用层不碰 fs） `serves: FR-1, FR-2`

在 [contracts.ts](../../../../../src/application/query/contracts.ts) 的 `PanelQueryDeps` 上补两个**可选**口
（缺省 = 旧单根行为，既有测试与旧接线逐字不变）：

```ts
/** 候选读根（按序、已去重、**只含真实存在的根**）；返回空数组 = 读根不可得。 */
docRootsOf?: (req: RequirementRecord) => string[]
/** 按根建文档读端口（构造适配器的事留在 http 层，应用层只调用）。 */
docsAt?: (root: string) => DocRepository
```

[panels.ts](../../../../../src/http/routers/panels.ts) 的 `depsForSession(sessionId)` 里构造两者：

- 候选序：`[req.workspaceRoot, sessionRoot, ctx.deps.cwd]` → 去空 → 去重 → `existsSync` 过滤；
- `docsAt`：`(root) => new FileDocRepository({ workspaceRoot: root })`（该文件已在构造适配器，不新增越层）。

## 判定实现要点 `serves: FR-1, FR-2, FR-3`

- 逐条产物**按候选序问**，首个命中即定 `state` 与 `absPath`（`repo.resolve(path)`）；
- 全不命中：`repos.length > 0 ? 'file-missing' : 'unknown'`（这一行就是 FR-3 的判据）；
- `generatedOf` 与 `prototypeRolesOf` 走**同一个命中根**（否则同一页面出现两处口径）；
- `unregistered`（设计文档未登记行）同样按多根判存在，避免又一处单根漏洞。

## 为什么不把候选解析放进 application 层 `serves: FR-2`

`existsSync` 是 `node:` 依赖，`tests/layer-boundary.test.ts` 机械禁止 application 层 import；
故「哪些根可用」在 http 层定，「用哪个根判」在 application 层定——与既有 `docs` 端口的分工一致。

## 失败要响亮 `serves: FR-3`

- 端口给了候选根但**全部根都不可用**：整表 `unknown`，并在 `DocsResponse` 已有的降级语气里
  保持 200（页面说"未判定"，不 500、不静默）。
- 一个候选根都不给（`docRootsOf` 缺省）：回旧行为，**不得**凭空把全部行标成 `unknown`（那会把未知变成另一种谎）。
