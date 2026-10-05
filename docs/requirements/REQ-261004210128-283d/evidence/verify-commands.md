# t5 证据：三道基线门禁（REQ-261004210128-283d）

生成时间：2026-10-04 21:41:15

## C-15 类型检查（npx tsc --noEmit）
```
总错误数：149
src/client 错误数：       0
基线：223（conventions.md C-15）
```
## C-12 客户端构建（pnpm build:client）
```
> tsdown -c tsdown.client.config.mjs && node scripts/wrap-client.mjs && node scripts/verify-client-build.mjs
✔ Build complete in 847ms
wrapped dsh-pmboard -> lib/client.js 389984 bytes
[verify-client] OK  bundle=424441 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
```

## C-14 全量测试（npx vitest run）
```
 Test Files  47 failed | 377 passed | 3 skipped (427)
      Tests  98 failed | 4517 passed | 20 skipped (4635)
基线：106 failed（conventions.md C-14）
```

## 本需求相关用例（三个文件）
```
 ✓ tests/client-session-running.test.ts  (17 tests) 5ms
 ✓ tests/client-view.test.ts  (59 tests) 32ms
 ✓ tests/board-attach.test.ts  (13 tests) 335ms
      Tests  89 passed (89)
```

## A1/A2/A3/A9 渲染证据（自动化可达的部分）

| 证据 | 路径 | 说明 |
|------|------|------|
| 渲染快照 | `docs/requirements/REQ-261004210128-283d/evidence/running-indicator-render.html` | 用**真实渲染函数**产出的三块对照：泳道（运行集合含 s-a）→ 恰 1 个转圈；列表 → 恰 1 个；运行集合为空 → 0 个。用浏览器打开可直接看到转圈动画与「减少动效」降级效果 |
| 渲染断言 | `tests/client-view.test.ts`（TC-08～TC-10） | `data-running="true"` 次数、aria-label、幂等、省略参数逐字节零回归、不误报 |
| 实时增隐断言 | `tests/board-attach.test.ts`（TC-12～TC-14） | 相关会话亮/灭各重绘 1 次；无关会话 0 次；dispose 后迟到通知 0 次 |
| 动效偏好断言 | `tests/client-view.test.ts`（样式契约） | 分片含 `prefers-reduced-motion` 分支且点名弧线动画 |

## TC-11a～TC-11e（应用内人工观察）：**待验收人执行，agent 未截图**

如实说明（不伪造）：agent 无法在浏览器里操作本 GUI 并截图，故这 5 张截图**不存在**。
可复现步骤（约 1 分钟）：

1. 刷新 http://127.0.0.1:19387 页面（客户端 bundle 已重建：`lib/client.js` 389984 字节，
   `[verify-client] OK`；刷新即加载新 bundle）；
2. 打开侧栏「项目看板」（泳道视图）：让任意一条需求绑定的窗口跑一个回合
   —— **看到该卡出现转圈**（TC-11a）；同泳道其它卡无转圈；
3. 点「列表」：**同一需求行出现同款转圈**（TC-11b）；
4. 等该回合结束、不刷新页面：**≤2s 内转圈自动消失**（TC-11c）；
5. 系统设置里开启「减少动态效果」后重看：**转圈变为静态半环**（TC-11d）；
6. 切暗色主题：**指示可辨**（TC-11e）。

若上述任一条与描述不符，请把现象写进验收意见——本需求按意见返工。
