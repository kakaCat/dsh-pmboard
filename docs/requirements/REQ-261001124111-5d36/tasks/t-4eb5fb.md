# t-4eb5fb 版本戳通道：bundle 内联戳 + SSE event: build 帧

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
版本戳通道：bundle 内联戳 + SSE event: build 帧

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：fullstack

## 得到什么结果
node scripts/verify-client-build.mjs 通过且 lib/client.js 内含 __DSH_PM_BUILD__；npx vitest run tests/panel-build-stamp.test.ts 全绿（相等→不提示 / 不等→提示 / 任一端缺失→不提示）；curl -N -m 3 http://127.0.0.1:19387/dashboard/api/reqboard/events 能看到 event: build 帧；curl -s .../requirements/<REQ>/stages 的键集合与改造前一致（既有 JSON 契约不变）。

## 实施方案（implementation）
改 scripts/wrap-client.mjs：读 lib/client.cjs 算 sha256 取前 12 位，注入 window.__DSH_PM_BUILD__ = "<stamp>"。改 src/http/routers/stages.ts 的 handleEvents：连接建立后补一帧 event: build + data: {"stamp":"…"}（读包根 lib/client.cjs 现算同口径哈希；读不到 → 不发帧，不声称）。客户端收到 build 帧时与内联戳比对，不等 → 经 buildNotice 显示「插件已更新（S1 → S2），点此刷新」（每个连接只提示一次，不自动 reload）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T05:01:58.761Z，窗口 session-ee20d093-b61b-486e-96c2-e2a256ecea70）

这一步做完，什么变了：页面第一次能自己发现「我跑的是旧代码」——构建时把前端代码指纹写进包里，宿主连接时把当前指纹与刷新策略发下来，一比就知道该不该提示刷新；指纹口径被钉成构建期硬门禁，两端不一致直接构建失败（不再靠人记得比对）。

### 完成项

- wrap 注入内联戳 + 宿主 client-build.ts + SSE build 帧（含 panel 策略）+ 构建期硬门禁 + 8 例单测
- 两端契约核对：event: build / stamp / panel 字段名逐一一致；缺失一律不声称
- pnpm build 通过（dist/index.mjs 13:01:31 重建 + lib/client.js 308237 bytes，verify OK）
- 内联戳 == 现算戳 == a2a9d5ec0b1f（构建期门禁保证）

### 改动文件

- `scripts/wrap-client.mjs`
- `scripts/verify-client-build.mjs`
- `src/http/client-build.ts`
- `src/http/routers/stages.ts`
- `src/http/routers/shared.ts`
- `src/http/routes.ts`
- `src/index.ts`
- `src/client/api.ts`
- `tests/panel-build-stamp.test.ts`
- `tests/panel-build-frame.test.ts`

### 下一步

真机 curl /events 需重启宿主进程才生效（会打断用户会话，未执行）；自动化等价证据：tests/panel-build-frame.test.ts 直测 handleEvents 写出该帧。宿主 dist 已重建，下次重启即生效。

---
