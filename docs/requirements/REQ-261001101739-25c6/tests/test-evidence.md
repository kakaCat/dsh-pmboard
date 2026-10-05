# 测试证据 · REQ-261001101739-25c6（流程节点刷新后样式全丢 · 样式表归属）

> 本文是验收材料的测试证据正文：命令 + 期望 + 实测结果。全部命令均可复跑；
> 标注「本机 GUI」的三条需要本机 GUI 与其鉴权会话（无法在 CI 复跑，步骤见 `../evidence/README.md`）。

## 1. 归属契约单测（主证据）

```bash
npx vitest run tests/client-styles-ownership.test.ts
```

| 期望 | 实测 |
|------|------|
| 6 passed | `Test Files 1 passed (1) · Tests 6 passed (6)` |

用例清单：工厂执行期注入 + 归属章、别的插件认领不走、HMR 替换先删后建、存量无主表归属纠正、删表自愈、无 `document` 静默。

**可证伪实验**（证明用例不是自我安慰）：

```bash
git stash push -- src/client/styles.ts src/client/conversation-progress.ts src/client/page/host.ts
npx vitest run tests/client-styles-ownership.test.ts
git stash pop
```

| 期望 | 实测 |
|------|------|
| 回到修复前 → 大量失败；还原后恢复全绿 | `Tests 5 failed \| 1 passed (6)` → pop 后 `6 passed (6)`；`git diff --stat src/client/styles.ts` 确认改动回来后为 48 insertions |

## 2. 发版门禁（正例 + 两个反例）

```bash
pnpm build:client
```

| 场景 | 期望 | 实测 |
|------|------|------|
| 正例 | exit 0，末行 OK | `[verify-client] OK  bundle=319777 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| 反例 A：删掉 `tag.dataset.plugin = PLUGIN_ID` | 非零退出 + 指名原因 | exit 1，`[verify-client] 产物缺少样式归属章（dataset.plugin=）：样式会被别的插件认领后连带删除（刷新后样式全丢）` |
| 反例 B：去掉 `styles/token.ts` 末尾反引号 | 非零退出 | `pnpm build:client` exit 1（先被 TS 编译层拦下）；`node scripts/verify-client-build.mjs` exit 1 且 stderr：`styles/token.ts 未以模板字符串收尾（反引号）：疑似被截断` |

两个反例均已还原（`git diff --stat` 对 `styles/token.ts` 无输出）。

## 3. 几何零回归（本需求不动 CSS）

```bash
npx tsx scripts/header-progress-probe.mts
```

| 期望 | 实测 |
|------|------|
| 六档 `problems=NONE` + `PROBE PASS`，exit 0 | 1280/1024/900/768/640/480 六档均 `problems=NONE`；末行 `PROBE PASS（6 档视口：标题行不溢出 / 档位可见集正确 / 当前节点恒可见 / 面板不越界）` |

## 4. 真实 GUI 复验（本机 GUI · headless Chromium 载入现有 GUI）

| # | 场景 | 期望 | 实测值 |
|---|------|------|--------|
| G1 | 归属章 | `data-plugin === "dsh-pmboard"` | `owners=["dsh-pmboard"]`（修复前为 `null`）；`cssLen=123466` |
| G2 | 打开绑定需求会话 | 流程图横向、7 节点 | `.dsh-pm-flow` `display=flex`、`.dsh-pm-flow-node` 计数 7 |
| G3 | 别的插件认领 + 整批删除（复刻 `claimStyles` / `removeOwnedStyles`） | 本表存活、样式不掉 | 本表仍在、`owner=dsh-pmboard`、`display=flex` |
| G4 | 存量无主表（撤掉 `data-plugin`、内容照旧）后触发自愈 | 归属被纠正、表数仍为 1 | `count=1`、`owner=dsh-pmboard`、`cssLen=123466`、`display=flex` |
| G5 | 手动删表 → 等一次轮询 | 最长 15s 内补回 | 18s 观察点：`count=1`、`owner=dsh-pmboard`、`display=flex`、7 节点 |
| G6 | 开着页面执行 `pnpm build:client`（HMR） | remove → 毫秒级 append，表数恒为 1 | `remove` → **5ms** → `append`；`owner` 与 `cssLen` 不变 |

截图：`../evidence/header-flow-compare.png`（故障态 vs 修复后）、`../evidence/header-flow-broken.png`、`../evidence/header-flow-fixed.png`、`../evidence/header-flow-after-hmr.png`。

## 5. 兼容与迁移

| 场景 | 期望 | 实测 |
|------|------|------|
| 旧无主表（修复前 bundle 注入的形态） | 就地补归属、不重复插表 | G4 通过（`count=1`） |
| 无 `document` 环境（node 单测 / host 半） | 静默 no-op 不抛 | 单测「无 document 静默」通过 |

## 6. 任务覆盖标注（covers）

| 证据节 | 覆盖任务（covers） |
|--------|-------------------|
| §1 归属契约单测 + 可证伪实验 | t-1af58c, t-11bfe5, t-af81b9, t-8fdabe |
| §2 发版门禁（正例 + 两个反例） | t-aa0ac9, t-548aca, t-0557b6, t-90472d, t-e2291f |
| §3 几何探针 | t-99f08e, t-ebd43f, t-5c0a67, t-68ce30 |
| §4 G1/G2 归属章与横向渲染 | t-0f6751, t-1d3f52, t-4d0c32, t-cf2018, t-88129f |
| §4 G4 存量无主表纠正 | t-f450f9, t-504ffb, t-671094, t-271267, t-76c3d8 |
| §4 G5 删表自愈 | t-9cbf93, t-50460a, t-9ce7ae, t-8d1b26, t-bd9015 |
| §4 G6 HMR 无空窗 | t-99f08e, t-68ce30 |

covers: t-0f6751, t-1d3f52, t-4d0c32, t-cf2018, t-88129f
covers: t-f450f9, t-504ffb, t-671094, t-271267, t-76c3d8
covers: t-9cbf93, t-50460a, t-9ce7ae, t-8d1b26, t-bd9015
covers: t-aa0ac9, t-548aca, t-0557b6, t-90472d, t-e2291f
covers: t-1af58c, t-11bfe5, t-af81b9, t-8fdabe
covers: t-99f08e, t-ebd43f, t-5c0a67, t-68ce30

## 7. 未覆盖（如实声明）

- 浏览器矩阵：只在 Chromium（本机 headless shell）与用户当前的 DSH 桌面窗口上验证，未覆盖 Safari/Firefox（本插件仅跑在 DSH 桌面/Web 壳内，壳即 Chromium）。
- HMR 与 GUI 三条证据依赖本机会话 cookie，无法在 CI 自动复跑；可复跑部分是第 1~3 节的单测/门禁/探针。
