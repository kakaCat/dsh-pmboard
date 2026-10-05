# t-9cbf93 流程图与看板页的样式在屏自愈接线

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
让「流程图 / 看板页面正显示在屏幕上」这件事本身成为修复信号：只要界面还在看，样式一旦丢了就自动补回来。

## 解决什么问题
即便归属修好了，仍可能有别的意外把样式表删掉（宿主将来改行为、别的插件误删）。此前一旦丢失就永久坏着，用户只能手动刷新碰运气。这张卡把恢复变成自动的：界面在屏幕上，最多 15 秒内样式自己回来。

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
样式被删掉后不需要用户做任何事：最长一次轮询周期内，流程图恢复成横向胶囊、圆点与配色全部回来。

验收（跑什么 / 看到什么算过）：
① npx vitest run tests/client-styles-ownership.test.ts -t "自愈" 通过；② 真实 GUI：删除 style[data-plugin-css="dsh-pmboard/styles.css"] → ≤15s（或打开「项目看板」页瞬时）表以正确归属重新出现，且 getComputedStyle(document.querySelector('.dsh-pm-flow')).display === 'flex'。

## 实施方案（implementation）
src/client/conversation-progress.ts 增加 useEffect(() => { injectStyles() }, [data])（随 15s 轮询/会话切换触发）；src/client/page/host.ts 挂载 effect 内先 injectStyles() 再 attachBoard。

## 上游产出摘要（dependsSummary）
- 样式表自带归属章并在工厂执行期注入

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T02:57:16.466Z，窗口 session-96ee4e52-6798-4e5b-b3a3-946152bfaf2a）

界面在屏期间样式丢不了：被删除后最长一个轮询周期内自动补回，用户不需要手动刷新或重开页面。

### 完成项

- 两处在屏自愈调用点落地（流程图组件 + 看板宿主）并通过单测 -t 自愈
- 真实 GUI：删表 → 18s 观察点已恢复（count=1 / owner=dsh-pmboard / flow=flex / 7 节点）
- 四条子卡（研发/联调/复核/测试）全部 done

### 改动文件

- `src/client/conversation-progress.ts`
- `src/client/page/host.ts`

---
