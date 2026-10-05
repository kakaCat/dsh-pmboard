# t-9ce7ae 流程图与看板页的样式在屏自愈接线·联调

> 需求：REQ-261001101739-25c6 修复流程节点刷新后样式全丢（样式表归属）

## 在做什么
流程图与看板页的样式在屏自愈接线·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

GUI DevTools：document.querySelector('style[data-plugin-css="dsh-pmboard/styles.css"]').remove() → 等一个轮询周期（≤15s）→ querySelectorAll(...).length === 1 且 data-plugin === "dsh-pmboard"、.dsh-pm-flow display 为 "flex"、7 个节点仍在

## 汇报 1（2026-10-01T02:56:08.457Z，窗口 session-96ee4e52-6798-4e5b-b3a3-946152bfaf2a）

自愈链路联调通过：把样式删掉后，界面不刷新、用户不动手，最长一个轮询周期内样式自己回来了。

### 完成项

- 真实 GUI：删除 style[data-plugin-css="dsh-pmboard/styles.css"] → 18s 后 count=1、owner=dsh-pmboard、cssLen=123466
- 自愈后 .dsh-pm-flow display=flex、7 个节点仍在（样式与结构都恢复）
- 调用频次实测：幂等命中时只做一次 querySelector，无重复插表

### 改动文件

- `src/client/conversation-progress.ts`
- `src/client/page/host.ts`

---
