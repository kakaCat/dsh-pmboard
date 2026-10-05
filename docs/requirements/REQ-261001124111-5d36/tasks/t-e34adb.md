# t-e34adb 版本戳通道：bundle 内联戳 + SSE event: build 帧·测试

> 需求：REQ-261001124111-5d36 缺陷：需求详情 DAG 层级图不展示、泳道图不展示卡片

## 在做什么
版本戳通道：bundle 内联戳 + SSE event: build 帧·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 `node scripts/verify-client-build.mjs; echo exit=$?` → `exit=0`；再跑 `npx vitest run tests/panel-build-stamp.test.ts tests/panel-build-frame.test.ts` → `Tests  8 passed`。

## 汇报 1（2026-10-01T05:18:29.749Z，窗口 session-ee20d093-b61b-486e-96c2-e2a256ecea70）

t4 测试阶段：构建门禁与戳一致性通过，目标测试全绿，宿主产物已重建。

### 完成项

- pnpm build:client 门禁 OK（bundle=330206，关键符号齐全，含 3 个新 class 锚点）
- lib/client.js 内联戳 == sha256(client.cjs)[0:12]（a2a9d5ec0b1f，拆分前那次构建）
- tests/panel-build-stamp.test.ts + panel-build-frame.test.ts → 8 passed
- pnpm build 重建 dist/index.mjs（13:01:31），供下次重启生效

---
