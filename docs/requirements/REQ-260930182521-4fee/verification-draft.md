# REQ-260930182521-4fee 验收材料（草稿 · 待带 reqboard 工具的窗口提交）

> 提交调用：reqboard_submit({ kind: 'verification', summary: <交付结论>, evidence: [<下列证据>] })

## 交付结论

DAG 画布与泳道双视图的任务卡颜色已按「卡片所处阶段」统一：六阶段色值收敛为单一事实源 STAGE_COLORS（泳道 CSS 由它插值、Canvas 取色读它），卡片着色 key 改用 laneOf 推导、与泳道列归属同源；新增 10 项一致性断言。纯展示层改动，无数据迁移。

## 证据清单（均可复核）

1. `pnpm vitest run tests/stage-colors.test.ts` → **10 passed**（TC-1..TC-6：色板唯一源 / 取色同源 / CSS 插值 / 泳道着色=列归属 / 画布着色=列归属 / 兼容回落）
2. 卡片验收命令：`-t 色板` → 4 passed；`-t 样式` → 1 passed；`-t 着色` → 6 passed
3. 相关既有模块无回归：card-layer 13 + node-panel 28 + card-face/stage-panel/client-subtask-view 等 → 41 passed（tests/layer-boundary 的 2 条红在 domain/ 未改动文件，属既有）
4. 实际生成的 CSS（运行时插值结果，取自 NODE_PANEL_CSS）：
   - `.dsh-pm-np-card[data-status="testing"], .dsh-pm-np-dag-node[data-status="testing"] { background: rgba(255,149,0,.08); }`
   - `.dsh-pm-np-card[data-status="in_review"], ... { background: rgba(233,30,99,.06); }`
   （六条卡片底色规则 + 六条列头色点/胶囊规则全部由色板生成）
5. 旧错位色板已删除：`grep -rn "fff4e5\|e8f9ed\|f3e5ff" src/client` → 无命中
6. 构建：`pnpm build` OK（dist/index.mjs 1.10 MB；lib/client.js 313 KB，verify-client OK，关键符号齐全）
7. 人工验收口径（需求 L1-2）：刷新看板后，父卡子卡链走到「测试」→ 泳道卡片 / 列头色点 / DAG 节点三处同为橙系；走到「复核」→ 三处同为粉系

## 改动文件

- src/client/dag/card-types.ts（唯一色板 + 取色函数）
- src/client/styles/node-panel.ts（卡片底色/列头色点由色板插值）
- src/client/dag/integration.ts（resolveTasks 派生 stageKey）
- src/client/dag/card-renderer.ts（画布取色 + cardHtml 用 stageKey）
- src/client/node-panel.ts（泳道卡片着色用 laneOf）
- tests/stage-colors.test.ts（新增 10 项断言）

## 已知非本需求红（供验收人参考）

`pnpm vitest run` 全量 272 文件中 103 项失败，均为改动前既有（如 tests/application/repository.test.ts 的 REQ 编号格式断言、tests/adapters/failure-alert、tests/layer-boundary 的 domain 非确定性检查等），涉及文件与本次改动无交集。
