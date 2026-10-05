# 测试证据 · REQ-260930194112-1ab8（列表视图自适应修复）

> **TL;DR**：三层证据全绿——① 5 条静态断言；② headless Chrome 五档宽度真实渲染探针（含负向验证，证明它真会红）；
> ③ 服务产物 `lib/client.js` 已含全部规则并通过 `verify:client`。修复前症状与修复后各档均有截图留证。

## 一、命令与结果（照抄可复跑）

| # | 命令 | 结果 |
|---|------|------|
| 1 | `./node_modules/.bin/vitest run tests/list-responsive.test.ts` | **5 passed**（TC-1 滚动容器 / TC-2 列类名成对 / TC-3 colspan 不变 / TC-4 样式规则齐备 / TC-5 空列表分支） |
| 2 | `npx tsx scripts/list-responsive-probe.mts` | **PROBE PASS**，退出码 0，5 行 DIAG 全 `problems=NONE` |
| 3 | 负向验证：把 `styles/board.ts` 的 `min-width: 720px` 临时改为 `2000px` 后重跑 ② | **PROBE FAIL**，退出码 1，报出 4 条「横向滚动 true ≠ 期望 false」（探针确实会红） |
| 4 | `node scripts/verify-client-build.mjs` | `[verify-client] OK bundle=309893 bytes, 关键符号齐全, styles.ts 括号配对` |
| 5 | 全套回归 `vitest run`（改动前 / 改动后） | 49 failed files / 103 failed tests → **同为 49 / 103**（失败来自工作区其它在飞需求），新增 5 用例通过 |

## 二、探针输出（第 2 条命令原样）

```
w=640 cols=4 titleW=282 overflowX=true problems=NONE
w=760 cols=4 titleW=282 overflowX=false problems=NONE
w=840 cols=4 titleW=362 overflowX=false problems=NONE
w=1080 cols=5 titleW=430 overflowX=false problems=NONE
w=1680 cols=8 titleW=540 overflowX=false problems=NONE

PROBE PASS（5 档宽度：关键列单行 / 按钮不重叠 / 操作列未压缩 / 列数按档让位 / 640px 横向滚动兜底）
```

## 三、修复前 / 后对照（截图）

| 文件 | 内容 |
|------|------|
| `evidence/before-840.png` | 修复前 840px：ID 占 3 行、`功能`/`拆分` 逐字竖排、`取消` 与 `会话` 叠字、操作列被压缩 |
| `evidence/after-840.png` | 修复后 840px：4 列（ID / 标题 / 状态 / 操作），ID 单行、按钮并排 |
| `evidence/after-640.png` | 修复后 640px：横向滚动兜底生效（`overflowX=true`），列不被压扁 |
| `evidence/after-1080.png` | 修复后 1080px：5 列（保留进度），让出分类 / 负责人 / 更新时间 |
| `evidence/after-1680.png` | 修复后 1680px：8 列，与修复前列几何逐字节一致 |

## 四、宽档不变式（FR-6）实测量法

用同一 fixture、仅切换源码树（HEAD 版 vs 本次版）渲染 1680px，量各列 `getBoundingClientRect()`：

```
HEAD   版：ID@20:224|标题@244:540|分类@785:84|状态@869:92|进度@961:226|负责人@1186:89|更新时间@1275:126|操作@1401:259 ; ROW_H=50
本次版  ：ID@20:224|标题@244:540|分类@785:84|状态@869:92|进度@961:226|负责人@1186:89|更新时间@1275:126|操作@1401:259 ; ROW_H=50
```

- 列 `left:width` 逐字节相同，标题列宽 540 不变。
- 像素级仍有约 3% 差异：放大差异图显示**仅表格外框 1px 抗锯齿**（新增滚动容器带来的亚像素取整），非内容位移。

## 五、产物校验（界面为什么能看到变化）

| 项 | 值 |
|----|----|
| 重建口径 | 用户裁定：HEAD + 本次两个文件，在隔离 git worktree 内构建（不带其它在飞需求的未提交改动） |
| 产物内容 | `lib/client.js` 含 `dsh-pm-table-wrap` 2 处；`min-width: 720px` / `min-width: max-content` / `max-width: 1180px` / `max-width: 880px` 各 1 处；`overflow-x: auto` 7 处；4 个列类名各 3 处 |
| 类名集合核对 | 新产物类名集合 = HEAD 构建集合 + 本次新增 5 个（`dsh-pm-table-wrap` + 4 个列类名），**无任何类名丢失** |
| 生效路径 | `~/.dsh/profiles/desktop` 与 `~/.dsh/profiles/web` 的 `node_modules/dsh-pmboard` 均为指向本仓的符号链接 → 界面刷新（⌘R）即加载新产物 |

## 六、明确未覆盖 / 未触发

| 项 | 说明 |
|----|------|
| 探针「找不到 Chrome → 退出码 2」分支 | 本机装有 Chrome，该分支未被运行时触发，仅代码级核对 |
| 真机 Safari / Firefox | 不在边界内；降级路径见 `design/data-model.md` D-3 |
| 像素级视觉快照 | 不做（字体渲染随平台差异），宽档以列几何判定代替 |

## 七、任务覆盖标注（每条指明用哪个可执行动作验）

| 任务卡 | covers | 怎么验（可执行） |
|--------|--------|------------------|
| 列表行 markup 契约（父卡） | covers: t-8479b2 | `./node_modules/.bin/vitest run tests/list-responsive.test.ts` → 5 passed |
| └ 研发 | covers: t-99dc0a | 同上 → TC-1/2/3/5 通过；`git diff -- src/client/views/board.ts` 可见滚动容器与 4 个列类名 |
| └ 复核 | covers: t-efd3af | `git diff -- src/client/views/board.ts` 与 `design/interfaces.md` I-1/I-2/I-4 逐条对照（列类名成对、colspan="8" 不变） |
| └ 测试 | covers: t-cac573 | `./node_modules/.bin/vitest run tests/list-responsive.test.ts` → 5 passed |
| 自适应样式与两档断点（父卡） | covers: t-24c90a | `grep -c "min-width: 720px" src/client/styles/board.ts` ≥1 且 `grep -c "max-width: 880px"` ≥1 |
| └ 研发 | covers: t-4a6bcf | 同上 grep + `./node_modules/.bin/vitest run tests/list-responsive.test.ts` → 5 passed |
| └ 复核 | covers: t-bab4cc | 对 `design/interfaces.md` I-3 的 7 条声明逐条 `grep`（脚本已跑，7/7 OK） |
| └ 测试 | covers: t-64530d | `./node_modules/.bin/vitest run tests/list-responsive.test.ts` → 5 passed（含 TC-4） |
| 五档布局探针（父卡） | covers: t-7a92ae | `npx tsx scripts/list-responsive-probe.mts` → 退出码 0、末行 PROBE PASS |
| └ 研发 | covers: t-2bd99a | 同上命令 → 5 行 DIAG 全 `problems=NONE` |
| └ 复核 | covers: t-1f6e47 | 比对 `scripts/list-responsive-probe.mts` 的档位期望与 `design/architecture.md` A-2 档位表（640/760/840→4、1080→5、1680→8） |
| └ 测试 | covers: t-1d8bbd | 负向验证：`min-width: 720px` → `2000px` 后跑同一命令，必须 PROBE FAIL + 退出码 1 |
| 兼容与证据（父卡） | covers: t-702bf4 | `git status --porcelain -- src/client/views/board.ts src/client/styles/board.ts tests/list-responsive.test.ts scripts/list-responsive-probe.mts package.json` → 2 M + 2 ??，package.json 无输出 |
| └ 研发 | covers: t-4c49aa | `ls docs/requirements/REQ-260930194112-1ab8/evidence/*.png | wc -l` → 5 |
| └ 复核 | covers: t-426253 | 同数据双源码树渲染 1680px 比对列 `left:width`（见 §四，逐字节相同） |

