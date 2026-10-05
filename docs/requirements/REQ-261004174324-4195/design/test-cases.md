---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: [backend, frontend]
---

# 设计 · 测试策略与验收口径（REQ-261004174324-4195 知识层自动自举）

## 测试策略总览 `serves: FR-7`

| 层 | 覆盖什么 | 手段 |
|---|---|---|
| 领域单测 | 渲染确定性、符号抽取口径、INDEX 骨架与生成区替换 | `vitest` + 纯函数直接调（无 fs） |
| 用例单测 | 缺/在/不完整/失败四态、幂等、不覆盖手写、根漂移中止 | 临时目录 + `FileDocRepository`；内存假端口跑一遍同断言 |
| 宿主装配测 | 三处通知点都触发 `ensure`、`enabled:false` 不触发、开关默认值 | 组合根单测（假 docs + 计数桩） |
| 客户端回归 | 入口与页面**不存在**（防复活）+ 其余页面注册不受影响 | `tests/client-page-register.test.ts` + 新增删除面断言 |
| 门禁 | 构建/类型/测试/知识层自检不劣化 | C-11 / C-12 / C-13 / C-14 / C-15 |

**可证伪总原则**：每条验收都写成"跑什么命令 → 看到什么"，不写"应该正常"。

## 用例表 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

| # | 用例 | 期望 | 服务 |
|---|---|---|---|
| T1 | 空临时目录调 `ensureKnowledgeLayer`（write） | `status:'created'`；5 个产物齐备：INDEX / code-map.md / code-map.symbols.tsv / design-tokens.md / design-tokens.classes.tsv | FR-2, FR-3 |
| T2 | 紧接着再调一次 | `created=[]`；全部文件内容与 `mtimeMs` 不变；`skipped` 说明 `same-content` | FR-2, FR-5 |
| T3 | 已有索引目录（本仓影子副本）调 write | `status:'skipped', reason:'index-exists'`；**不读源码**（用假端口计数断言 read 调用次数 = 0） | FR-2, FR-5 |
| T4 | 预先写 `architecture.md` 与 INDEX 手写行 → 调 write | 两者逐字不变（`diff` 为空）；生成物照常补 | FR-3, FR-5 |
| T5 | 无 `src/` 的项目 → 调 write | `status:'created'`；code-map 页含「未发现源文件」；退出码不为 1 | FR-3 |
| T6 | INDEX 缺少 `<!-- kb:generated:begin/end -->` 标记 → 调 write | `status:'failed', reason:'markers-missing'`；**不写任何文件**；手写内容零改动 | FR-5 |
| T7 | 只读根（`chmod 500`）→ 调 write | `status:'failed'` + `failedPath` + `error`；**不抛异常**；`written` 如实列出已写项 | FR-5 |
| T8 | 生成中途把根改到另一个目录（模拟并发校正） | 中止并 `reason:'root-drifted'`；原根与新根都无半成品 | FR-5 |
| T9 | 协调器同根并发调两次 | 用例只执行 1 次（假用例计数）；两个调用者拿到同一结果 | FR-2 |
| T10 | 配置 `autoBootstrap:false` / `enabled:false` / 不写 | 三种情况：不触发 / 不触发（且工具空集）/ 触发 | FR-6 |
| T11 | 配置 `autoBootstrap:"no"`（非布尔） | 装配期抛 `Error('knowledge.autoBootstrap 只能是 boolean：实际 no')` | FR-6 |
| T12 | 三处通知点（激活 / `applyWorkspaceRoot` / `resolveDocRoot`） | 各自调用 `ensure` 一次；同根合并不重复 | FR-2 |
| T13 | 领域渲染确定性 | 同输入两次 `renderCodeMap` / `renderDesignTokens` / `scaffoldIndex` 输出逐字节相同；无时间戳 | FR-4 |
| T14 | CLI 与用例同源 | `--root <fixture>` 走 CLI 与直接调用用例，产物逐字节相等 | FR-4 |
| T15 | 客户端删除面 | `pmboard-knowledge` 在注册表与源码中零命中；看板面板注册仍为 `main` + `sidebar.panellist` 两端同源 | FR-1 |
| T16 | API 侧未受影响 | `tests/kb-route.test.ts` / `tests/kb-repository.test.ts` / `tests/kb-archive-deposit.test.ts` 全绿 | FR-1, FR-7 |

## 可执行验收命令与期望 `serves: FR-7`

```bash
# 1) 自举核心（领域 + 用例 + 装配）
pnpm vitest run tests/kb-generate.test.ts tests/kb-ensure.test.ts tests/kb-bootstrap-hooks.test.ts
#    期望：三份全绿（T1–T14 的自动化部分）

# 2) 删除面回归（T15）
grep -rn "pmboard-knowledge\|KnowledgePanelHost\|KNOWLEDGE_CSS" src/ scripts/ tests/ ; echo "exit=$?"
#    期望：零命中，exit=1

# 3) Agent 侧未受影响（T16）
pnpm vitest run tests/kb-route.test.ts tests/kb-repository.test.ts tests/kb-archive-deposit.test.ts
#    期望：全绿

# 4) 客户端构建门禁（C-12）
pnpm build:client
#    期望：[verify-client] OK  bundle=… bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整

# 5) 生成物零漂移（C-13；本仓已有知识层，自举不得污染）
pnpm kb:check ; echo "exit=$?"
#    期望：exit=0

# 6) 宿主构建 / 类型 / 测试基线（C-11 / C-15 / C-14）
pnpm build        # 期望：退出码 0，dist/ 与 lib/client.js 均为新产物
pnpm typecheck    # 期望：错误数 ≤ 223（既有基线）
pnpm test         # 期望：失败数 ≤ 106（既有基线），新增用例全绿
```

## 门禁与基线 `serves: FR-7`

| 门禁 | 命令 | 阈值 / 期望 | 依据 |
|---|---|---|---|
| 构建（host+client） | `pnpm build` | 退出码 0，两侧产物更新 | C-11 |
| 客户端重建 | `pnpm build:client` | `[verify-client] OK`（关键符号 + 归属章 + 分片） | C-12 / C-05 |
| 知识层自检 | `pnpm kb:check` | 退出码 0（生成物零漂移 + 九项自检） | C-13 |
| 测试 | `pnpm test` | 失败数 ≤ 106（删掉 `tests/kb-client-page.test.ts` 后总用例数下降属预期，验收材料需如实标注） | C-14 |
| 类型 | `pnpm typecheck` | 错误数 ≤ 223 | C-15 |

## 手工验收 `serves: FR-1, FR-2`

1. `mktemp -d` 造空项目 → 在其中启动插件（或注入假 docs 根指向它）→ 确认 `docs/knowledge/` 5 个产物出现。
2. 再启动一次 → `ls -l --time-style=full-iso docs/knowledge/` 的 mtime **一个都不变**。
3. 手写 `architecture.md` 加一行 → 再启动 → 该行仍在。
4. 打开 http://127.0.0.1:19387 → 侧栏**没有**「知识库」；看板页与需求流水线一切如常。
5. 在本仓会话里调 `reqboard_kb(list=true)` → 仍能取到条目（Agent 侧能力未被删除波及）。

## 未覆盖与已知风险（响亮声明） `serves: FR-5`

| 项 | 说明 |
|---|---|
| 冷启动问答质量 | 自举出的 INDEX 是骨架，架构/规范/术语仍是「待写」——**本需求不承诺**新项目立刻可答架构问题（那是人工/Agent 补齐的事） |
| 真实 GUI 截图 | 删除面验证以源码零命中 + 构建门禁 + 注册单测为准；human 侧截图按人工验收第 4 条补 |
| 并发多会话同根 | 由 realpath 归一 + 单 promise 去重覆盖；跨进程（多个宿主实例）**不保证**互斥，属已知边界（写入为内容比对后的幂等写，最坏结果是重复写同内容） |
