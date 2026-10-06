# t-dab64c 三窗口端到端回归与判别力自证

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
三窗口端到端回归与判别力自证

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/project-identity.e2e.test.ts → E-01~E-04 全绿；pnpm test → 失败数 ≤ HEAD 基线（先在 HEAD 取一次基线数）；六条停用证据各有一份可复核输出。

## 实施方案（implementation）
新增 tests/project-identity.e2e.test.ts（真实 HTTP + 台账 + 假注册表：窗口 x/y 同项目 + 窗口 z 另一项目）；补「停用即红」证据：逐一停用 rootOf 的 id 分支、sameProjectOf 的 id 优先分支、看板过滤、Dive 归属比较、派席校验、立项写 id，各自对应用例必须变红，记录命令与红/绿摘要。

## 上游产出摘要（dependsSummary）
- 立项定身份：写入 projectId 与未归属标注
- 看板 / 扫描 / 知识层 / 子代理根一律按项目
- Dive 归属按项目、派席与交接拦跨项目

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T07:32:58.945Z，窗口 session-97aa4376-441a-4f0a-800a-7b13aad48a09）

这一步做完，「这套判据真的在管事」有了可复核的凭据：四条三窗口端到端全绿，六条接线逐一停用都当场变红又恢复，全量失败数还比开工前少一条。

### 完成项

- 三窗口 E2E 补齐并全绿：E-01 各看各的且产物互不越界、E-02 邻居改走共享根仍落本项目、E-03 同项目双窗口起轮只一次、E-04 跨项目改绑 HTTP 400 + 错误码
- 六条停用即红自证全部现场做完并留档：覆盖取根身份分支 / 同一项目判据 id 优先 / 看板按项目筛 / Dive 归属比较 / 派席改绑校验 / 立项写身份
- 额外补一条判别：把「起轮按绑定窗口」改成按项目找（= 拿 projectId 当窗口用）→ E-03 变红（投递数 2 ≠ 1）
- 每条停用的恢复都做了逐字节校验（diff 与备份一致），临时补丁零残留
- 证据落盘：docs/requirements/REQ-261005141830-7a3b/evidence/t9-stop-red.md（命令 + 红/绿摘要 + 含义 + 复跑方式）
- 全量：67 失败 / 5456 通过——比开工前基线（68）少一条（kb-generate 因生成物重生成而转绿），零新增失败

### 改动文件

- `tests/project-identity.e2e.test.ts`
- `docs/requirements/REQ-261005141830-7a3b/evidence/t9-stop-red.md`

### 下一步

本卡三段子卡链收尾后，需求全部任务完成、自动进入验收；随后提交验收材料。

---
