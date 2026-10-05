# 测试证据（REQ-261004210128-283d）

> 全部命令于 2026-10-04 在本工作区实跑，输出摘要如下（原始摘要在 `evidence/verify-commands.md`）。

## 一、本需求用例（三个文件）

```
$ npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts
 ✓ tests/client-session-running.test.ts  (17 tests)
 ✓ tests/client-view.test.ts  (59 tests)
 ✓ tests/board-attach.test.ts  (13 tests)
      Tests  89 passed (89)
```

TC ↔ 文件的落点：

| 用例 | 文件 | 断言要点 |
|------|------|----------|
| TC-01～TC-03 | `tests/client-session-running.test.ts` | 真假值 / 服务缺失降级 / 无订阅能力的旧客户端 |
| TC-04～TC-06 | 同上 | 席位权威（任一在跑）/ 折算单 owner / 人工建卡 |
| TC-07 | 同上 | 订阅触发一次，退订后不再触发；退订函数幂等 |
| TC-08～TC-10 | `tests/client-view.test.ts` | 泳道卡与列表行出现/消失、幂等、省略参数逐字节零回归、不误报 |
| 样式契约 | 同上 | `prefers-reduced-motion` 分支点名弧线动画；颜色走主题令牌 |
| TC-12～TC-14 | `tests/board-attach.test.ts` | 无关会话 0 次重绘 / 相关会话各 1 次 / dispose 后迟到通知 0 次 |
| TC-11a～TC-11e | **人工浏览器**（非自动化） | 见 `evidence/verify-commands.md` 末节的 6 步复现路径；截图待验收人产出 |

## 二、三道基线门禁

```
$ npx tsc --noEmit -p tsconfig.json        → 149 error（基线 223），src/client 零错误
$ pnpm build:client                        → [verify-client] OK  bundle=424441 bytes
$ npx vitest run                           → 98 failed | 4517 passed | 20 skipped（基线 106 failed）
```

失败清单中与本需求相关的文件：**0 条**（`tests/client-*`、`tests/board-attach`、`tests/token-card`、`tests/session-jump` 全绿）。

## 三、渲染对照读数（快照证据）

`evidence/running-indicator-render.html`（用真实渲染函数产出，浏览器可开）：

| 场景 | `data-running="true"` 计数 |
|------|---------------------------|
| 泳道视图，运行集合 = {s-a}（REQ-000001 绑定 s-a） | 1 |
| 列表视图，同一集合 | 1 |
| 泳道视图，运行集合为空 | 0 |

## 四、环境与可复现性

- 测试环境：vitest node 环境（本包不含 jsdom），服务以假投影注入，无真实会话 / 无网络依赖；
- 复现命令均可直接照抄执行，无需额外准备（用例自带夹具）。

## 覆盖标注（covers，供 RTM 测试覆盖度门禁读取）

> 5 张父卡 + 13 张子卡逐张对应证据。子卡阶段落在同一份用例上时如实指向同一文件（不为凑数编造不同命令）；
> 复核段无独立用例时，证据是「对照结论 + 命令输出」，并在该子卡的完工记录里留痕。

### TC-1 覆盖 t-ba99ec（t1 父卡：运行态读数与需求→会话映射单点）

covers: t-ba99ec

证据：`npx vitest run tests/client-session-running.test.ts` → 17 passed（真假值 / 五种降级 / 席位真值表 / 订阅退订）。

### TC-2 覆盖 t-5a3ed9 / t-f38dec / t-aa9635（t1 三段子卡：研发 / 复核 / 测试）

covers: t-5a3ed9
covers: t-f38dec
covers: t-aa9635

证据：同上 `tests/client-session-running.test.ts`（17 passed）；研发段另有 24 项行为自检与 `pnpm typecheck`（src/client 零错误）；复核段结论见 `reviews/self-review.md`。

### TC-3 覆盖 t-64c0f8（t2 父卡：泳道卡与列表行显示运行中转圈）

covers: t-64c0f8

证据：`npx vitest run tests/client-view.test.ts` → 59 passed（TC-08～TC-10：出现/消失、幂等、省略参数逐字节零回归）。

### TC-4 覆盖 t-9d8d32 / t-ee91b9 / t-345aae（t2 三段子卡）

covers: t-9d8d32
covers: t-ee91b9
covers: t-345aae

证据：同上 `tests/client-view.test.ts`；另 `npx vitest run tests/token-card.test.ts tests/client-styles-ownership.test.ts` → 9 passed（既有调用方零回归 + 样式分片归属）；`pnpm build:client` → `[verify-client] OK`。

### TC-5 覆盖 t-5e7436（t3 父卡：实时亮灭与重绘门控）

covers: t-5e7436

证据：`npx vitest run tests/board-attach.test.ts` → 13 passed（TC-12～TC-14：无关抖动 0 次重绘、相关抖动各 1 次、退订后 0 次）。

### TC-6 覆盖 t-451182 / t-4bf79e / t-7f815f（t3 三段子卡）

covers: t-451182
covers: t-4bf79e
covers: t-7f815f

证据：同上 `tests/board-attach.test.ts`（13 passed）；复核段结论见 `reviews/self-review.md` 的门控与生命周期两行。

### TC-7 覆盖 t-1a836c（t4 父卡：自动化用例成组）

covers: t-1a836c

证据：`npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts` → 89 passed。

### TC-8 覆盖 t-97559a / t-05fa1e / t-2821b4（t4 三段子卡）

covers: t-97559a
covers: t-05fa1e
covers: t-2821b4

证据：同上 89 passed；A9 样式契约用例断言 `prefers-reduced-motion` 分支点名弧线动画；全量 `npx vitest run` → 98 failed / 4517 passed（≤106 基线），`npx tsc --noEmit` → 149 错误（≤223 基线）。

### TC-9 覆盖 t-f06b62 / t-f44a33（t5 父卡与复核子卡：三道基线 + 证据归档）

covers: t-f06b62
covers: t-f44a33

证据：`docs/requirements/REQ-261004210128-283d/evidence/verify-commands.md`（typecheck 149 / build OK / 全量 98 failed）+ `evidence/running-indicator-render.html`（泳道 1 个转圈、列表 1 个、空集 0 个）。
