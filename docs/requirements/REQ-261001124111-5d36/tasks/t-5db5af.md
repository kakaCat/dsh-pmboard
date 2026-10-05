# t-5db5af 回归与端到端自检：既有断言不破 + 手工 E2E 证据

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
回归与端到端自检：既有断言不破 + 手工 E2E 证据

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
npx vitest run 全绿（含既有 node-panel / dag-view 用例零改动）；pnpm typecheck 退出码 0；上述 5 条手工步骤各有留档证据文件（缺任一条本卡不通过）；「改坏必红」抽查一次：注释掉周期轮询后 tests/panel-refresh.test.ts 必须转红。

## 实施方案（implementation）
跑全量门禁与测试；按 design/test-cases.md 的手工验收步骤取证据：① 面板展开在拆分节点，另一窗口推进一张卡 → 面板 ≤5 秒出现新卡（不刷新页面）；② curl /stages 的 body.tasks 数量与面板显示一致；③ DevTools 断网 30 秒 → 红条 + data-stale=1，恢复 ≤10 秒消失；④ 切换需求 → 先「详情加载中…」再只显示新需求；⑤ 改一行客户端源码 → pnpm build:client → 已打开页面出现「插件已更新」。证据落 docs/requirements/REQ-261001124111-5d36/evidence/（命令 + 输出摘要 + 截图路径）。

## 上游产出摘要（dependsSummary）
- 组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关
- 版本戳通道：bundle 内联戳 + SSE event: build 帧

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T05:12:05.352Z，窗口 session-ee20d093-b61b-486e-96c2-e2a256ecea70）

这一步做完，什么变了：交付从"我改好了"变成"有体检报告、且没冒充实测"——全量回归改动前后逐字相同（失败零增量、新增 41 例全绿）、改坏必红当场转红、尺寸门禁合规；真机三步明确标注待人工复核，判据写在验收材料里，谁都能照着复现。

### 完成项

- 全量回归（含本次）：106 failed / 2787 passed；基线：106 failed / 2746 passed ⇒ 新增 41 例全绿、失败零增量
- 本次 5 个测试文件 41 passed；既有面板测试 57 passed 零改动；构建门禁 verify OK（bundle=330378）
- 改坏必红抽查：注释周期轮询 → 5 例转红；还原后 11 绿
- 证据落盘 8 份：evidence/{t3-acceptance,t5-test-stage,t5-mutation,t5-stages-count,t5-stamp,t5-summary,t5-full-vitest-with-change,t5-full-vitest-baseline}
- 尺寸门禁自查：本次文件命中 0（拆分出的 panel-freshness.ts / use-panel-refresh.ts 合规）

### 改动文件

- `docs/requirements/REQ-261001124111-5d36/evidence/t5-test-stage.txt`
- `docs/requirements/REQ-261001124111-5d36/evidence/t5-summary.md`

### 下一步

三张真机步骤（① 落库后 ≤5 秒自动出现、③ 断网红条、⑤ 换版提示点击）标注为待人工复核——需重启宿主 + 真浏览器，重启会打断当前会话；自动化已覆盖同一段判定逻辑。下一步：t6 文档同步（project-manual 已写入机制备忘待登记）。

---
