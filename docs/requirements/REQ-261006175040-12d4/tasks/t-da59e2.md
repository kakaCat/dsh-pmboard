# t-da59e2 E2E 出图脚本与三态证据

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
E2E 出图脚本与三态证据

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
npx tsx scripts/card-gates-ui-shot.mts 退出码 0（0 成功 / 1 有图不像话 / 2 环境不可用，不静默跳过）；PNG 覆盖三态卡面 + 降级态；人看与 prototypes/card-gates.html 逐区块一致（锚点 5/5）。

## 实施方案（implementation）
新增 scripts/card-gates-ui-shot.mts（沿用 scripts/req-detail-ui-shot.mts 的 headless Chrome 手法），PNG 落 docs/requirements/REQ-261006175040-12d4/evidence/，退出口径 0/1/2。

## 上游产出摘要（dependsSummary）
- 卡面渲染改为只读读数（删客户端判定）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T10:48:11.462Z，窗口 session-5678dda2-4511-465c-bae1-0b321cd1c0fc）

t9 完成：出图脚本落地并跑通四张（三态 + 降级），图与权威原型一致；出图前的内容断言保证「画的不是错的东西」。

### 完成项

- 新增 scripts/card-gates-ui-shot.mts：真渲染（renderReqCard）+ 真 CSS（BASE/BOARD/SUBTASK）+ headless Chrome 2 倍图
- 出图前先断言卡片 markup 的内容（缺「✓ 需求文档」等即判画错），渲染坏了不交图
- 四态各出一张 PNG：analysis（门 0/4 + 确认产物）/ design-group（门 1/4 + 全部 6 份）/ implementing（门 3/4 + 计划已批 + 无按钮）/ degraded（整块不渲染）
- 产物落 docs/requirements/REQ-261006175040-12d4/evidence/card-gates-<state>-1280-cards.png（2560×1800，各 ~100 KB）
- 退出口径照既有脚本：0 成功 / 1 有图不像话 / 2 环境不可用（找不到 Chrome 时打修复指引）
- 四态用同一组进度计数（26/38）构成单变量对照——图上唯一差异就是门读数本身
- 施工事故与修正（如实记录）：第一版内容断言打在整页 HTML 上，被 <style> 里的选择器名误伤（degraded 假红）——已改为只断言卡片 markup
- 命令证据：npx tsx scripts/card-gates-ui-shot.mts → 退出码 0，四张全 OK

### 改动文件

- `scripts/card-gates-ui-shot.mts`
- `docs/requirements/REQ-261006175040-12d4/evidence/card-gates-analysis-1280-cards.png`
- `docs/requirements/REQ-261006175040-12d4/evidence/card-gates-design-group-1280-cards.png`
- `docs/requirements/REQ-261006175040-12d4/evidence/card-gates-implementing-1280-cards.png`
- `docs/requirements/REQ-261006175040-12d4/evidence/card-gates-degraded-1280-cards.png`

### 下一步

t10：兼容与回滚收口（旧服务端降级实测 + 构建/类型/基线读数 + 回滚演练）

---
