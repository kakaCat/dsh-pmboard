# 复核报告 · REQ-261003191948-e94a（t1 及其连带改动）

> 复核人：实施窗口 `session-44207972`（就地复核；`t-5479a5` 因链阻塞未能开工，见 `../tasks/t-5479a5.md`）
> 复核对象：t1（迁移门预检 + 可复制 hint）与连带改动（信封抽取、未就绪 handler、三相启动、客户端错误体）
> 复核时点：2026-10-03

## 一、逐条对照设计文档的 serves 与验收条款

| 条款 | 设计落点 | 实现 | 判定 |
|---|---|---|---|
| FR-1 未就绪也起得来 | architecture.md §目标形态；backend.md §`apply()` 的分叉改动 | `index.ts` 由裸断言改为 `preflightLedger` + `if (!preflight.ok) { enterNotReadyMode(...); return }` | ✅ 分叉在 `new ShardedRequirementStore` **之前**；静态断言锁死"只按 `preflight.ok` 分叉" |
| FR-2 全端点 503 + 结构化 | interfaces.md §HTTP 端点状态码矩阵 | `http/not-ready.ts` 挂在同前缀，任何方法/路径回 503 | ✅ 四类请求断言 503（显式断言 ≠404）；`envelope.ts` 新增 503 映射 |
| FR-3 hint 代入真实路径 | interfaces.md §`hint` 的命令构造契约 | `migrationGate.migrationHint` 单一构造点 | ✅ 断言含真实 `ledgerFile`/`dataRoot`、含 `--apply`、不含 `<单册>`/`<数据根>` |
| FR-4 客户端不再丢原因 | frontend.md §问题定位 | `api.ts` 的 `unwrap`/`fetchReqFile` 改走 `errorOf`；`buildError(msg, hint)` | ✅ 断言 message 等于服务端原文、code/hint 透传；空体退回 `HTTP <status>` 不编原因 |
| FR-5 降级态零副作用 | data-model.md §反例 | `enterNotReadyMode` 只注入 `webServer`、只写日志 | ✅ 断言只注入 `['webServer']`；断言夹具数据根未建 `requirements/` 与 `meta.json` |
| FR-6 失败留痕响亮 | backend.md §实现要点 | 宿主 `logger.error` + `captureDiag` 各一条 | ✅ 断言日志含 code 与 `--apply`；诊断文件**恰好一行** |

**设计边界复核**：`requirement.md` §边界 第 2 条"不覆盖迁移门之外的装配异常"——
`index.ts` 中不出现字面量 `REQBOARD_REQUIRES_MIGRATION`（静态断言），边界未被放宽。✅

## 二、复核发现（3 条，全部已处理）

### F1 · 诊断行未单行化（**阻塞级，已修**）

- 现象：`captureDiag` 的 `detail` 直接内插 `failure.hint`，而 hint 自带换行
  （`"请执行：\n" + 命令`）⇒ 命令落到**第二行**，按行消费的诊断文件只留半句。
- 这正是本需求要根治的形态（"日志停在半句话"），却被我在实现里复现了一次。
- 处置：`enterNotReadyMode` 中 `.replace(/\n/g, ' | ')`；测试加了一条只认一行的断言
  （`lines` 长度为 1 且含 `--apply`）——该断言在修复前确实为红。

### F2 · 两个新类名没有样式（**可用性缺陷，已修**）

- 现象：`buildError` 渲染 `dsh-pm-error-hint-label` / `dsh-pm-error-hint`，
  但 `src/client/styles/` 里没有任何规则；父容器 `.dsh-pm-error` 是 `text-align: center` ⇒
  命令块**居中**，路径与参数对不齐、无法照抄；`<pre>` 默认不换行还会横向溢出。
- 设计文档（frontend.md §目录与包结构）写的是"不改 `src/client/styles/`，复用既有令牌"——
  **该假设经复核不成立**。
- 处置：在 `base.ts` 的 `.dsh-pm-error` 之后补 3 条规则（左对齐、等宽、可换行、可选中、
  复用 `--dsw-*` 令牌）。**属对设计的有意偏离**，理由与证据记此。

### F3 · 探针里的属性访问会抛异常（**我自己引入的回归，已修**）

- 现象：定位引擎问题时加的探针读了 `ctx.workflowEngine`，cordis 对未声明 inject 的属性访问
  直接抛 `cannot get property "workflowEngine" without inject` ⇒ 把 runner 原本优雅的
  `engine_unavailable` 变成 run 异常（`advance-log.md` 11:45:13 那条）。
- 处置：改为只用 `ctx.get(name)` + `typeof`，并整体 try/catch；`byProp=` 在 src 与 dist 均为 0。
  **注意**：该修复在 19:46 构建，运行中的宿主仍加载旧探针，**下次重启后才会恢复优雅降级**。

## 三、复核未能覆盖的部分（不冒充已验证）

1. **未做端到端"未就绪启动"实测**。t3/t4 用例是**隔离**验证（假 res / 假 ctx），
   没有在"真实单册在场 + 无 meta.json"的环境里跑过一次真实的插件装配。
   下一次可复现的实验：造该夹具 → 重启宿主 → `curl -i /dashboard/api/reqboard/health`
   期望 503 + hint，而不是 404。
2. **未核对未就绪态下客户端页面的实际观感**（中文字体下的命令块换行、深浅色对比）。
3. **热重载不加载新宿主代码**这一结论由标记实验得出（evidence §4），
   但未确认是否存在其它路径（如 `hmr` 的依赖失效）能让宿主模块重载——只确认了当前这条不可行。

## 四、结论

- 6 条 FR 的实现与设计落点逐条对得上，边界未被放宽。
- 复核发现 3 条缺陷：2 条由测试当场抓到（F1、F3），1 条由人工复核抓到（F2）；均已修复并重建。
- **不予通过的点**：第三节 3 项未覆盖，其中第 1 项（端到端未就绪启动）建议在验收阶段由人补一次真实冒烟。
- 卡片勾稽（`t-5479a5` / `t-3b4d8e` / `t-bec57a`）**未完成**，原因是链的引擎不可达，
  与本需求的代码质量无关；已在 `verification-evidence.md` §5.2 定性。
