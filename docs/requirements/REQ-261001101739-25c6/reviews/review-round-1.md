# 复核记录 · REQ-261001101739-25c6（流程节点刷新后样式全丢 · 样式表归属）

> **TL;DR**：6 张任务卡的复核结论汇总——实现与批准的设计**无实质偏离**；有 **1 处「与设计字面不同」的实测偏差**已逐条声明；
> 另如实列出 **3 项遗留与限制**（其中 1 项是本次验证自身的局限，不美化）。

## 1. 复核范围与结论

| 卡 | 复核对象 | 结论 |
|----|----------|------|
| t1 注入契约 | `src/client/styles.ts` 的建表分支 vs `design/interfaces.md` I-1 / I-2 | 无偏离（归属章、注入时机在模块求值期、无 `document` 静默早退逐条一致） |
| t2 归属纠正 | `injectStyles()` 的纠正分支 vs `design/interfaces.md` I-1 INV-3 | 无偏离（命中既有表只改归属、不追加第二张表） |
| t3 在屏自愈 | 两处调用点 vs `design/interfaces.md` I-3 | 无偏离（均写在 `useEffect` 内、幂等、不在 render 期做 DOM 副作用） |
| t4 发版门禁 | `scripts/verify-client-build.mjs` vs `design/interfaces.md` I-4 | **1 处实测偏差**（见 §2） |
| t5 契约单测 | 用例覆盖 vs `design/test-cases.md` T-1 | 无偏离（I-1 四条不变量 + I-2 两条宿主语义逐条对应用例；含可证伪实验） |
| t6 端到端复验 | 四条 GUI 复验与证据 vs `design/test-cases.md` T-4~T-6 / `use-cases.md` UC-1~UC-5 | 无偏离；UC-4（旧无主表）在真实 GUI 复刻通过 |

## 2. 一处实测偏差（设计字面 vs 实际）

| # | 设计里写的 | 实际行为 | 触发它的证据 |
|---|-----------|---------|--------------|
| 1 | I-4：「`styles/*.ts` 不以模板字符串收尾 → 非零退出并**指名分片**」 | 走 `pnpm build:client` 时，截断先被 **TS 编译层**拦下（tsdown 非零退出，报错是语法错误而非门禁文字）；门禁的指名信息（`styles/token.ts 未以模板字符串收尾（反引号）：疑似被截断`）在**直接跑 `node scripts/verify-client-build.mjs`** 时可见 | 临时去掉 `styles/token.ts` 末尾反引号 → `pnpm build:client` exit 1（tsdown）；`node scripts/verify-client-build.mjs` exit 1 且 stderr 打出上述指名信息 |

判定：**两种路径都是响亮失败**（都不静默、都非零退出），只是报错来源不同；门禁仍是「文件还能编译、但 CSS 内容被截断」这一形态的第二道网。已同步写进 `../evidence/README.md`。

## 3. 遗留与限制（如实列出）

| # | 事项 | 影响 | 处置 |
|---|------|------|------|
| 1 | HMR 复验（`remove → 5ms → append`）依赖**本机 GUI + 鉴权 cookie**，无法在 CI 复跑 | 该项证据是「本机实测」而非「可自动复跑」 | 已在 `../evidence/README.md` 标注为「本机实测步骤」，并给出可在 DevTools 手动复刻的片段 |
| 2 | 真实 GUI 复刻用的是现有 GUI 的**会话 cookie**（headless Chromium 载入 `127.0.0.1:19387`） | 复跑者需要自备有权限的会话，不能匿名复跑 | 同上，README 里写清了前置与步骤 |
| 3 | 契约单测用的是**最小 DOM 替身**，不是真实浏览器 DOM | 替身与真实 DOM 的行为差异（如 `dataset` 投影、选择器支持范围）靠「未实现的选择器直接抛错」兜底，但不是浏览器级验证 | 真实浏览器行为由 t6 的实时 GUI 复验覆盖（`display: flex`、7 节点、cssLen 123466 均为实时量测） |

## 4. 注释与命名核对

- `PLUGIN_ID` 与 `PANEL_NAME` 刻意分离：注释已写明「装载身份 ≠ UI 身份」，避免日后改 UI 身份时样式归属跟着漂。
- 注入点的注释给出了宿主侧事实出处（`packages/client/modules/src/client/system.ts` 的 `claimStyles`、`entry-lifecycle.ts` 的 `removeOwnedStyles`、官方 `tsdown.client.ts` 的 `styleInjectionModule`），便于后续维护者复核。
