# 测试证据 · REQ-260930182521-4fee

> 全部命令在本仓根目录（workspaceRoot）实跑，输出摘要如下。

## 1. 新增一致性测试

```
$ pnpm vitest run tests/stage-colors.test.ts

 ✓ tests/stage-colors.test.ts  (10 tests) 5ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

覆盖：TC-1 色板六键齐全 / TC-2 取色函数同源 / TC-3 泳道 CSS 由色板插值 / TC-4 泳道着色=列归属 / TC-5 画布着色=列归属 / TC-6 兼容回落（缺省 stageKey、未知状态、todo/solo/存量卡）。

## 2. 按任务卡验收口径筛选

```
$ pnpm vitest run tests/stage-colors.test.ts -t 色板   → 4 passed | 6 skipped
$ pnpm vitest run tests/stage-colors.test.ts -t 样式   → 1 passed | 9 skipped
$ pnpm vitest run tests/stage-colors.test.ts -t 着色   → 6 passed | 4 skipped
```

## 3. 相关既有模块（无回归）

```
$ pnpm vitest run tests/card-layer.test.ts tests/card-face.test.ts tests/node-panel.test.ts \
      tests/stage-panel.test.ts tests/client-subtask-view.test.ts tests/stage-colors.test.ts \
      tests/layer-boundary.test.ts
 → 6 passed / 1 failed (140 tests, 138 passed)
   失败 2 项位于 tests/layer-boundary.test.ts，指向 domain/checkpoint.ts、domain/job-spec.ts
   的 Date.now() 使用——与本次改动文件无交集，属改动前既有红。
```

## 4. 旧色板清除核对

```
$ grep -rn "fff4e5\|e8f9ed\|f3e5ff\|STATUS_BACKGROUND_COLORS\|STATUS_TEXT_COLORS" src/client
NO_MATCH
```

## 5. 构建

```
$ pnpm build
✔ Build complete（dist/index.mjs 1.10 MB）
✔ Build complete（lib/client.js 312.83 kB → wrapped 293589 bytes）
[verify-client] OK  bundle=313084 bytes, 关键符号齐全, styles.ts 括号配对
```

## 6. 生成的 CSS（运行时插值结果抽样）

```css
.dsh-pm-np-card[data-status="todo"], .dsh-pm-np-dag-node[data-status="todo"] { background: #fafafa; }
.dsh-pm-np-card[data-status="in_progress"], ... { background: rgba(0,113,227,.06); }
.dsh-pm-np-card[data-status="integrating"], ... { background: rgba(142,68,173,.07); }
.dsh-pm-np-card[data-status="testing"], ... { background: rgba(255,149,0,.08); }
.dsh-pm-np-card[data-status="in_review"], ... { background: rgba(233,30,99,.06); }
.dsh-pm-np-card[data-status="done"], ... { background: rgba(52,199,89,.08); }
```

## 7. 全量回归的既有红（供验收人参考）

```
$ pnpm vitest run
 Test Files  49 failed | 220 passed | 3 skipped (272)
      Tests  103 failed | 2701 passed | 20 skipped (2824)
```
失败项集中在改动前既有的模块（REQ 编号格式断言、failure-alert、layer-boundary 的 domain 非确定性检查等），与本次改动的 5 个源文件无交集。

## 8. 待人工确认（agent 不自判）

- 看板实测：刷新后，子卡链走到「测试」的父卡，泳道卡片 / 列头色点 / DAG 节点是否三处同为橙系；走到「复核」是否同为粉系。

## 9. 端到端场景用例（E2E）

```
$ pnpm vitest run tests/stage-colors-e2e.test.ts

 ✓ tests/stage-colors-e2e.test.ts  (3 tests) 16ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

场景链路（走生产入口、非构造入参）：QueueTaskStore.createMany 写 queue.json → JsonQueueRepository + QueueTaskStore.listByRequirement 读回 → renderNodePanel 渲染泳道 HTML / buildDagData + resolveTasks + cardHtml 渲染画布数据 → 终态断言：
1. 子卡链走到「测试」的父卡：泳道卡片 data-status=testing、画布 stageKey=testing、列头色点取色 = STAGE_COLORS.testing.fg（同一色板）
2. 链走到「复核」的父卡：两视图同为 in_review，取色 = STAGE_COLORS.in_review.bg
3. 无子卡的存量卡：两视图保持自身状态色（回溯兼容）

## 10. 覆盖标注（covers）

上述十条断言与三个筛选命令共同覆盖本需求全部任务卡（4 父卡 + 9 子卡）：

covers: t-286f8c, t-d5bd67, t-511852, t-17e963, t-726e1d, t-8ff853, t-0c8c68, t-1d3406, t-63a749, t-754c40, t-2a156b, t-207a75, t-487ad8
