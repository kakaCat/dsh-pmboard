# 插件运行前提（L2 领域篇）

> **TL;DR**：本插件（`dsh-pmboard`）能否在宿主里被加载，取决于**三个外部前提**：profile 的 bundles
> 列了它、`package.json` 声明了 `dsh.bundle.patch`、**且该 patch 文件真实可读**——第三条缺失时
> 加载器会**静默跳过整个 bundle**（工具、看板路由、提示词注入全不注册）。另外，**重建 `dist` 不会
> 自动生效**：宿主在启动时加载模块，重建后必须重启，且"是否真的加载了新构建"要显式核对。

## 一、加载链（任一环断 → 插件整体消失）

```
profile 的 dsh.profile.bundles  ──►  包的 package.json  ──►  patch 文件可读  ──►  插件行进入有效条目
     列出 dsh-pmboard              声明 dsh.bundle.patch      cordis.patch.yml         （工具/路由/注入注册）

任断一环的后果：skippedBundles ← 只有 stderr 一行：
  dsh: skipping profile bundle "dsh-pmboard": failed to read overlay …/cordis.patch.yml: ENOENT
```

**为什么值得单列**：这条链断掉时，agent 侧的表现是"工具凭空消失"（`unknown tool`），而板子与宿主都还活着；
2026-09-30 就因此排查了约 25 分钟——**重启无效**，因为文件仍然不存在。

### 一句话核对（不重启即可判定）

```bash
# 用 DSH 自己的加载器复现组合过程：skippedBundles 里不该有本插件，且有效条目里应有 pmboard 行
node --input-type=module -e "
const m = await import('<dsh-checkout>/packages/boot/app-boot/lib/index.js')
const p = m.loadProfileDirectory('dsh', '<profile 目录>', '<app 的 dsh/package.json>')
console.log(p.skippedBundles, m.composeEntries([...p.layers.map(l=>l.patches), p.patches]).find(e=>e.id==='pmboard'))
"
```

## 二、构建产物 ≠ 已加载模块（"重启了但没生效"）

| 事实 | 核对方式 |
|---|---|
| 宿主在**启动时**加载 `dist/index.mjs`；重建不会自动生效 | 比对宿主进程启动时间与 `dist/index.mjs` 的 mtime |
| "新构建是否真被加载"不能靠感觉 | `grep -c '<本轮新增的符号>' dist/index.mjs` 确认产物含改动；再看宿主启动时间是否晚于该 mtime |
| 同一个仓库里"重启"可能加载到**更旧**的构建 | 事故实例：`dist` 20:23 重建，宿主 19:44 启动 → 重启静默无效，验收单仍呈旧行为 |

**产品级可见信号**：旧构建生成的验收单会呈现被修复前的形态（跳号、多行同名）——"单据本身"是最直观的对照证据。

**包地址的 `rev` 也会过期（2026-10-06，REQ-261006115829-dafb）**：客户端插件包按 combo 地址分发，地址里带 `rev`
（宿主按入口产物的 mtime / ctime / size 合成），而宿主**只服务当前 `rev`**——重建后旧地址一律 404，
页面手里拿的却是**文档装载时**的那批地址。所以「页面一直开着 + 你在外面重建了客户端」会在控制台留下
一条包地址 404；`plugins/events`（HMR 的 SSE 通道）也会因宿主重启被掐断而记一条 net::ERR_FAILED。
两者都靠 HMR 重试或刷新页面自愈；判据（含 `rev` 对照实验）与处置见[插件重载排查](../guides/plugin-reload-troubleshooting.md)。

## 三、源码树与构建产物必须自洽（2026-09-30 三连事故）

| 事故 | 现象 | 判据 |
|---|---|---|
| 缺 4 个被 import 的源码模块 | 测试**加载失败**（不是断言失败） | `Failed to load url ../internal/auto-confirm.js` |
| 缺 patch 文件 | 插件被整体跳过 | `skipping profile bundle …: ENOENT` |
| 文件语法损坏（两行语句挤一行） | `tsdown` 直接 PARSE_ERROR；`tsc` 报 TS1005 | 构建日志 `[PARSE_ERROR] … AcceptSheet.ts:160` |

**共同根因**：多个会话共用同一工作树 + 覆写式同步删除未被跟踪的文件。**防复发**：
① 关键文件（patch 文件、`docs/`、新建源码/测试）纳入 git；② 每个会话用独立 worktree（`.worktrees/REQ-xxx`）；
③ 复原缺失模块时可从 `dist/index.mjs` 的 `//#region src/...` 源码段逐字取回（构建产物是源码的忠实镜像）。

## 四、客户端样式表必须自带归属（2026-10-01「刷新后样式全丢」）

客户端样式不是"注入进去就完事"：DSH 的 client-modules 按 **`data-plugin` 归属**登记与删除样式表。

| 时机 | 宿主行为 | 无主表的后果 |
|---|---|---|
| 任意模块 materialize | `claimStyles(ownerId)`：把所有 `style:not([data-plugin])` 打上 `data-plugin=ownerId`，并把 `data-plugin-css` 记入该模块 owned 清单 | **被别的插件认领走** |
| 插件 HMR 替换 / 图行裁剪 / 卸载 | `removeOwnedStyles(ownerId)`：删除所有 `style[data-plugin=ownerId]` | 随认领者被**连带删除**（且本插件 `apply()` 不会重跑 → 永不恢复） |

**契约（三条，缺一即复发）**：

1. 注入的 `<style>` **必须自带** `data-plugin = 装载 id`（= 包名，与 `__ModuleLoader__.load({ id })` 同源；≠ UI 身份 `PANEL_NAME`，两者刻意分离）；
2. **必须在 bundle 工厂执行期注入**（模块求值期），这样 `claimStyles` 会把本表登记为**本插件所有**；等到 `apply()` 才注入就漏登记；
3. 注入器**幂等 + 可纠正**：表已在且归属正确 → 直接返回；归属不符 → 就地改回（不重复插表）；被删除 → 下一次调用补回（在屏组件自愈）。

**症状与判据**：流程图/看板样式突然全丢（节点竖排、圆点与配色消失），文案看不出原因；判据是
`document.querySelector('style[data-plugin-css="dsh-pmboard/styles.css"]').getAttribute('data-plugin')` 为 `null`（应为 `dsh-pmboard`）。

**发版门禁**：`scripts/verify-client-build.mjs` 硬阻断「产物缺 `dataset.plugin=` / `dataset.pluginCss=`」，
并把 CSS 分片截断信号挂到 `src/client/styles/*.ts`。回归用例：`tests/client-styles-ownership.test.ts`（6 条，对修复前实现 5/6 失败）。

来源：REQ-261001101739-25c6（材料见 `docs/requirements/REQ-261001101739-25c6/`）。

## 五、工作区根：**读取入口**必须与写入入口同根（2026-10-03 事故）

**症状**：插件热重载后，`reqboard_task_tree` / `reqboard_task_run` 一律报「任务不存在」，
看板「任务」页空白，而 `docs/requirements/<REQ>/queue.json` 里 10 张卡完好。

**根因**：`workspaceRoot` 在 `apply()` 时取自 `process.cwd()`；DSH 宿主的 cwd 是**启动目录**
（desktop profile 下是 `~/.dsh/profiles/desktop`，重启后可能是 `/`），不是任何会话的工作区。
仓库早有唯一收敛点 `agentIdFromExec()`——用 `exec.agent.session.header.cwd` 同时校正
`FileDocRepository` 与 `JsonQueueRepository` 的根（REQ-260929210741-30ae FR-5），
但**三个任务读取入口绕过了它**（`TaskTree` / `AdvanceTool` / `RunStatusTool` 直连
`deps.session.windowKey(exec)`）。旧实例之所以正常，只是因为此前的写入类调用顺手校正过根。

**判据**：`GET /dashboard/api/reqboard/state` 返回的 `workspaceRoot` 不等于会话工作区；
或同一进程里写入路径能落盘到工作区、读取路径却报「不存在」。

**修法**：任务读取入口一律走 `agentIdFromExec(deps, exec)`（它返回同一个 windowKey，附带根校正）。
回归用例：`tests/reqboard/task-read-root-sync.test.ts`（正例 + 反例，**回退那一行即红**）。

来源：REQ-261003191948-e94a（材料见 `docs/requirements/REQ-261003191948-e94a/`）。

## 六、`workflowEngine` 被 preset **刻意隔离**：profile 级插件不可达

**症状**：子卡链每一次 `RUN_SUBTASK` 都失败于 `workflow run 未完成（engine_unavailable）`，
而**同一进程里** `workflow` 工具能正常起 run。

**根因（配置级证据）**：DSH 的 agent preset
（`packages/bundle/web-app/presets/cordis.patch.yml`）把引擎圈在 agent 的 delegation 组内：

```yaml
- id: delegation
  name: cordis:group
  group: true
  isolate:
    workflowEngine: true        # ← 只有该组内可见
  config:
    - id: workflow-ptc   ; name: '@deepseek-ai/dsh-workflow-ptc'
    - id: tool-workflow  ; name: '@deepseek-ai/dsh-tool-workflow'
```

故 profile 级 bundle（本插件）**按设计**取不到它：
`inject(['workflowEngine'])` 回调永不触发、`ctx.get('workflowEngine')` 恒 `undefined`、
`ctx.workflowEngine` 属性访问被 cordis 守卫直接拒（`cannot get property … without inject`）。
**这不是取法写错——改多少次 `ctx.get` / `inject` 都不会好。**

**判据（一行探针）**：引擎解析失败时写一行
`reqboard-capture [ENGINE-PROBE]: inject=… get=… byGet=false captured=false [tools=true agents=true webServer=true]`
——对照组为 true 而 `workflowEngine` 为 false，即"作用域隔离"而非"取法不对"。

**当前处置**：不可达时返回**结构化可行动**原因（`subtask_engine_unreachable` + 两条出路 + "重试无解"，
并保留 legacy 子串 `engine_unavailable` 供既有分类器识别），绝不静默成功；
子卡凭证改由「本窗口自证」兜底（见七）。

来源：REQ-261003191948-e94a。

## 七、子卡完工凭证：**没有成功的 run** 才允许汇报兜底

**症状**：一次**环境类**失败（如引擎不可达）会在卡上留下 `lastRun.ok=false`，
此后该卡**再也无法收尾**，且没有任何工具能清 `lastRun` —— 毒状态。

**根因**：凭证门原判据是「**有没有** run 记录」（`if (run === undefined)` 之后紧跟 `if (!run.ok)`），
而不是「有没有**成功的** run」。于是失败记录把「人工推进的子卡用汇报当凭证」这条兜底永久堵死
（该兜底的存在理由见 REQ-260929195829-6e02 t1）。

**修法（2026-10-03）**：判据改为「没有成功的 run」**且**失败属**环境类**
（`engine_unavailable` / `engine_unreachable`，含 legacy 形状）时才开兜底；实质性失败保持原口径拒绝。
**为什么必须限制在环境类**：宽口径会让一份**更早的报告**把"本次派发本身失败"洗白
（`ExecuteTask` 在 run 失败后仍会尝试 `done`）——实测把 `execute-subtask-team` 的
`team_report_stale` 守卫跑红（对着 `t-c42bc0` 真实事故）。走兜底时**必须**留一行结构化痕迹
（`[SUBTASK-REPORT-FALLBACK] … failedRun={…}`），不许把失败静默吞掉。

**残余风险（已知）**：非引擎类的环境故障（如 provider 全挂 → `run_failed`）仍会把卡毒死；
放宽它需要先让 reason 词表能可靠区分"环境 vs 实质"。

回归用例：`tests/reqboard/subtask-evidence-fallback.test.ts`（10 条，修前必红 4 条）。
来源：REQ-261003191948-e94a。

## 八、UI/UX skill 资产：**包内是源，工作区才是子代理能读到的地方**（2026-10-05）

**是什么**：插件包自带宽 7 份 UI/UX skill 资产（`<pkg>/skills/`，含可检索的主 skill：79 风格 /
192 配色 / 74 字体配对 / 119 UX 准则 / 22 技术栈）。需求分析节点会注入一小节「原型工作原则」，
要求做原型时**派 subagent**，主 agent 只拿两个绝对路径（`SKILL.md` 与 `scripts/search.py`）加一条
命令模板——**全文与 2.7MB 数据不进主 agent 的每轮 system prompt**。

**为什么必须"投放"这一步**：子代理的文件/命令工具**限工作区**，读不到插件包内部。
故资产在包内是**源**，`reqboard_skill_install` 把它投放到 `<会话工作区>/.dsh/skills/`，
回执给出 `root` 与 `searchScript` 的绝对路径，主 agent 把这两个路径写进派发 prompt。

| 项 | 约定 |
|---|---|
| 投放根 | `<会话工作区>/.dsh/skills/`（隐藏目录；写 `.gitignore(*)` 自忽略） |
| 幂等 | 逐文件 `sha256` 全等 → `reused=true` 且一个字节都不写；`force=true` 可强制重写 |
| 事务 | 先写 `<root>.tmp-<id>` → 逐文件校验 → 整体改名；失败清临时目录，**不留半份** |
| 溯源 | 投放根写 `.manifest.json`（上游 commit、许可、逐文件哈希）；包内 `skills/PROVENANCE.md` 是同一份事实的源 |
| 防漂移 | `node scripts/vendor-skills.mjs --check` 重算 28 条指纹，手改一个字节即 exit 1 并点名文件 |
| 回滚 | `rm -rf <root>/.dsh/skills`；或插件配置 `skills.enabled=false`（不注入该节 + 工具返回 disabled） |

**外部前提：检索要 Python 3**（探测顺序 `python3` → `python` → `py -3`，实测 3.8.10 可用）。
**缺失不是失败**：资产照常投放，回执里 `python.found=false`，主 agent 必须把
「本轮未做数据库检索，以下为通用默认」如实转达——**禁止**把未检索包装成检索结果
（与上游 `SKILL.md` 自带的同名纪律一致）。

**注入落点**：新增片段约定 `<stage>/<difficulty>-extra.md`（`priority=10`，**可裁**，只被同难度的
路由壳 include）。本节落在 `brainstorming/heavy-extra.md`，故**只有重档有**——类型档会同时进轻档，
而轻档有 2500 字符上限，塞进去会撞破它。命名刻意两段：三段 id 被"路由壳"占用。

**判据**：`node scripts/vendor-skills.mjs --check` exit 0；`node scripts/check-prompt-fragments.mjs` exit 0；
`npx vitest run tests/skills-assets.test.ts tests/skills-materialize.test.ts tests/skills-provenance.test.ts tests/skills-injection.test.ts`。

来源：REQ-261005122347-e07a（材料见 `docs/requirements/REQ-261005122347-e07a/`，含裁剪与落点两处裁定的依据）。
