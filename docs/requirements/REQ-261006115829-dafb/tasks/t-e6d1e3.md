# t-e6d1e3 写排查条目页并落实判据契约

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
写排查条目页并落实判据契约

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
① F=docs/guides/plugin-reload-troubleshooting.md；for s in 症状 判据 机制 处置 非目标; do grep -c '^## .*'$s $F; done → 五段各输出 1
② wc -l $F → ≤ 120
③ grep -c 'text/event-stream' $F → ≥ 1；grep -c 'rev' $F → ≥ 3
④ grep -cE '应该能|一般会' $F → 0

## 实施方案（implementation）
新建 docs/guides/plugin-reload-troubleshooting.md，按 design/interfaces.md 的条目页骨架写五段 H2：症状 / 判据 / 机制 / 处置 / 非目标。
症状段：照抄两条红字原文形态——一条是插件包地址 404（形如 dsh-app://app/plugins/??<包>/client.js&rev=<rev>），另一条是 dsh-app://app/plugins/events 的 net::ERR_FAILED；写明两条成因不同。
判据段：写 design/interfaces.md 的 C-1 / C-2 / C-3 三条命令；端口与 rev 一律写 <host> / <rev> 占位并注明「逐次实测取值」；每条给期望输出与不符时的分诊一句话。
机制段：宿主按入口产物的 mtime / ctime / size 合成 rev，重建即让旧 rev 失效（旧地址 404）；/plugins/events 是 @deepseek-ai/dsh-client-hmr 的 SSE 通道，宿主重启或页面卸载即断，EventSource 自动重连；桌面壳只把 / 、/index.html 、/assets/** 、/favicon.svg 、/manifest.webmanifest 当静态文件，其余路径一律转发宿主。
处置段：先刷新页面；仍红则取证（DevTools → Network 按状态码筛 404，保留完整 URL）并交回排查。
非目标段：非包地址的 404、宿主不可达、无 rev 的地址，各自去哪查。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T04:09:45.576Z，窗口 session-c9490164-89ba-491f-90ba-824aa5002549）

父卡收尾：排查条目页按设计契约落盘，子卡链两段全绿，无偏离无返工。

### 完成项

- 交付：新建 docs/guides/plugin-reload-troubleshooting.md（61 行）
- 五段契约齐：症状 / 判据 / 机制 / 处置 / 非目标
- 判据三条命令 C-1 / C-2 / C-3 落地，端口与 rev 写占位并注明逐次实测取值
- 父卡验收四条全过：五段各 1、61 行 ≤120、text/event-stream 命中 1、rev 命中 9、禁用语 0
- 子卡链两段收口：研发段（t-2b9f5e）与复核段（t-20b429）均 done，复核结论为无偏离
- 未改任何运行时代码：本条只新增 docs/ 下一个文件

### 改动文件

- `docs/guides/plugin-reload-troubleshooting.md`

### 下一步

开 t-4c36ac：两处入口回链（说明书索引 + 运行前提页机制一句）

---
