# 复核报告 · t1 宿主兼容入口（t-2cd503 研发段 t-20c87f）

- **复核方式**：独立子代理（fresh context、**只读**：不改任何文件，只读文件 + 跑测试 + 源码阅读）
- **被复核对象**：`src/http/legacy-board-route.ts`、`src/index.ts` 的 webServer 注入块、两个测试文件
- **对照契约**：`design/interfaces.md` §宿主 HTTP 路由契约、`design/architecture.md` §关键结构决策（D-1）
- **结论**：**可以过复核**（契约逐条落地、源码无偏离、无阻塞缺陷），附 4 条跟进项

## 逐条核对

| 检查项 | 结论 | 证据 |
|---|---|---|
| 方法矩阵 GET/HEAD→200；其余→405 + `allow: GET, HEAD`；HEAD 无需额外分支 | 一致 | `legacy-board-route.ts:56/66-74/75-81`；真连接实测 HEAD 200 且 bodyLen=0 |
| `content-type` 含 text/html、`cache-control: no-store` | 一致 | `:76,78`（405 分支 text/plain `:69`）；桌面转发不剥这两头 |
| 中转表达式同时带 search+hash 且与契约逐字一致 | 一致 | `:50` == `interfaces.md:39`，顺序 search→hash 正确 |
| 逐字节幂等（handler 层） | 一致（线级见 R3） | 常量体 `:47-53`；只读 `req.method`；测试 `:88-95` |
| 零业务数据（无反射点） | 一致 | 不回显 `req.url`；body 为编译期常量；测试断言不含 REQ-/requirements/tasks |
| 两条 exact 注册；exact 先于 fallback；与前缀不互遮 | 一致（尾斜杠约定见 R2） | `index.ts:790-792` + `legacy-board-route.ts:39`；webserver `match()/handle()` 佐证；宿主侧无其它 `/dashboard` 注册者 |
| 撤销覆盖两条、顺序合理；effect 重跑/HMR 不炸装配 | 一致 | 组合 disposer + reverse + 逐个 try/catch；cordis `Effect` 允许返回 `Disposable`（`fiber.ts:77`）；`restart()` 先卸再重放 |

## 偏离与风险清单 + 处置

| # | 风险 | 处置 |
|---|---|---|
| R1 | **dist 未重建 → 运行态仍 404**（中高，运维项） | **已转 t5 并落实**：本需求最后一张卡执行 `pnpm build`，产物取证见 `evidence/README.md` E-2；运行态重载前仍 404 已如实记录（E-3） |
| R2 | `/dashboard/` 违反宿主 `WebRoute.path`「不带尾斜杠」约定（低） | **保留两条注册**（这正是防「有时能开、有时 404」的写法），并把「已知约定例外 + 可安全撤销条件」写进模块注释 |
| R3 | 契约「响应逐字节相同」措辞强于线级事实（node 注入 `date`）（低） | 口径收窄为「handler 产出部分逐字节相同」，测试断言 body/自设头；不关 `sendDate` |
| R4 | effect 内两条注册无回滚：第 2 条抛错会留下无 disposer 的泄漏注册（低） | **已修**：抽成 `registerLegacyBoardRoutes()`（失败回滚已注册者再抛），补 3 条单测（注册顺序 / 撤销相反顺序且幂等 / 第 2 条抛错回滚） |
| R5 | not-ready（迁移未就绪）分支未注册兼容入口 → 降级态仍 404（低） | **未做并如实记账**：超出已确认设计的覆盖面（相 1 才注册），建议另立小卡；已写进验收材料 |
| R6 | FR-2 消费端当时尚不存在 → 本卡单独交付是「不再 404 但不定位」（提示） | 验收口径已写明：FR-1 的形状达标与端到端定位分属不同卡，不整条划勾 |
| R7 | HEAD 去体假设在假 res 用例中不可证伪（低） | **已修**：补真 `node:http` 集成用例（HEAD → 200 且 body 为空、GET → 体为常量） |

## 命令输出摘要

- `npx vitest run tests/legacy-board-route.test.ts tests/apply-wiring.test.ts` → 1 failed / 10 passed；其中唯一失败为存量红（`tests/apply-wiring.test.ts` 工具名清单期望 18 实收 23，改动前即红，证据：HEAD 版已注册 adopt/regenerate 而清单不含）
- `npx tsc --noEmit | grep -E 'legacy-board-route|apply-wiring'` → 无输出
