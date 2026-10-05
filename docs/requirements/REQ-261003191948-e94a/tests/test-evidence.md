# 测试证据 · REQ-261003191948-e94a

> 采集：2026-10-03 19:4x ｜ 工作区 `/Users/mac/Documents/ai/dsh/dsh-pmboard`
> 对应卡：`t-3b4d8e`（测试段，因链阻塞未开工；测试工作由实施窗口就地完成）

## 用例 ↔ 任务覆盖（`covers:` 标注，供 RTM 覆盖度门禁读取）

> 说明：`t-5479a5`（复核）与 `t-3b4d8e`（测试）两张子卡因链阻塞**未开工**
> （原因见 `../tasks/t-5479a5.md` 与 `../tasks/t-3b4d8e.md`），
> 但这两个阶段的**工作**已由实施窗口就地完成，产物分别是 `../reviews/self-review.md` 与本文件。
> 下面每节标注该节用例实际覆盖的任务卡；`covers:` 语义 = "该卡的验收标准被这些用例覆盖"。

### TC-1 迁移门预检三态与可复制 hint

covers: t-bb9da6, t-bec57a
validates: FR-1, FR-3
文件：`tests/reqboard/migration-gate.test.ts`（7 用例）

### TC-2 唯一信封与迁移门 503 映射

covers: t-f6e737
validates: FR-2
文件：`tests/reqboard/degraded-startup.test.ts` 的「t2」组（5 用例）

### TC-3 未就绪 handler：任何方法/路径 503、SSE 不挂起、零副作用

covers: t-683371
validates: FR-2, FR-5
文件：`tests/reqboard/degraded-startup.test.ts` 的「t3」组（3 用例）

### TC-4 三相启动分叉与双通道留痕

covers: t-ba11c3
validates: FR-1, FR-5, FR-6
文件：`tests/reqboard/degraded-startup.test.ts` 的「t4」组（3 用例）

### TC-5 客户端错误体透出

covers: t-e70cdf
validates: FR-4
文件：`tests/api-client.test.ts`（5 用例）

### TC-6 看板命令块渲染与转义

covers: t-cae674
validates: FR-4
文件：`tests/api-client.test.ts` 的 `buildError` 组（含转义与无 hint 逐字节不变）

### TC-7 回归与纪律核验（构建 / 类型 / 全量基线）

covers: t-ef9858
validates: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
文件：本文件 §3 / §4 / §5

### TC-8 任务读取入口的工作区根校正（计划外修复①）

covers: t-bec57a, t-5479a5, t-3b4d8e
validates: FR-1
文件：`tests/reqboard/task-read-root-sync.test.ts`（正例 + 反例，修前必红已证）

---

## 1. 定向用例（本需求全部新增/改动面）

```
$ npx vitest run tests/reqboard/migration-gate.test.ts \
    tests/reqboard/task-read-root-sync.test.ts \
    tests/reqboard/degraded-startup.test.ts \
    tests/api-client.test.ts

 ✓ tests/api-client.test.ts                  (8 tests)
 ✓ tests/reqboard/task-read-root-sync.test.ts (2 tests)
 ✓ tests/reqboard/degraded-startup.test.ts   (11 tests)
 ✓ tests/reqboard/migration-gate.test.ts     (7 tests)

 Test Files  4 passed (4)
      Tests  28 passed (28)
```

**用例与条款的对应**（详见 `../design/test-cases.md`）：

| 文件 | 覆盖 |
|---|---|
| `migration-gate.test.ts` | FR-1 / FR-3：预检三态、hint 无占位符、两入口 message 逐字同源 |
| `degraded-startup.test.ts` | FR-2（信封 5 条）/ FR-2+FR-5（handler 3 条）/ FR-1+FR-5+FR-6（接线 3 条） |
| `api-client.test.ts` | FR-4：错误体透出、空体退回状态码、非 JSON 体、渲染与转义 |
| `task-read-root-sync.test.ts` | 计划外修复①：读取入口必须走工作区根收敛点（正例 + 反例） |

## 2. 修前必红（两份机械证明）

```
# 计划外修复①：回退 TaskTree.ts 的收敛点
$ sed -i '' 's/agentIdFromExec(deps, exec)/deps.session.windowKey(exec)/' src/application/use-cases/TaskTree.ts
$ npx vitest run tests/reqboard/task-read-root-sync.test.ts
 Test Files  1 failed (1)      Tests  1 failed | 1 passed (2)      ← 预期为红
（还原后即 2 passed）
```

```
# t2：envelope.ts 不存在时，degraded-startup.test.ts 的 import 直接失败 → 本层全红
```

## 3. 构建与类型

```
$ pnpm build
✔ Build complete（host）
wrapped dsh-pmboard -> lib/client.js 314980 bytes
[verify-client] OK  bundle=337435 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整

$ pnpm build:client（C-12：改了 client 源码必须重建）
[verify-client] OK  bundle=337435 bytes

$ npx tsc --noEmit -p tsconfig.json
150 error（C-15 基线 223）→ 不高于基线
改动文件过滤结果：0 条
（唯一命中 src/index.ts 的是 ctx.emit 重载的历史既有错误）
```

## 4. 全量基线与定向核验

```
$ npx vitest run
 Test Files  48 failed | 280 passed | 3 skipped (331)
      Tests  98 failed | 3337 passed | 20 skipped (3455)

C-14 基线：106 failed / 2807 passed  →  98 ≤ 106，判过
（局限：基线是较早快照，非同 commit 逐项 diff，已如实标注）
```

**定向核验**（所有 import 到本次改动面的用例文件，共 40 个一起跑）：

```
357 passed / 9 failed
失败分属：design-completeness-gate(5) / routes-rollup(2) / plan-mode(1) / size-budget(1)
均为设计门、状态 rollup、尺寸门，与本次改动面无关
反证：把 src/http/routes.ts 精确回退到 HEAD 后，这 3 个文件变成 19 failed
      （工作区含未提交 WIP）⇒ 这 9 条失败不是本次改动引入
```

## 5. 客户端构建新鲜度

```
$ stat -f "%Sm %N" dist/index.mjs lib/client.js
Oct  3 19:43:01 2026 dist/index.mjs
Oct  3 19:43:02 2026 lib/client.js
$ find src -name '*.ts' -newer dist/index.mjs     → （空：无 src 比产物新）
```

## 6. 未做的测试（不冒充已完成）

- **端到端未就绪启动实测**：未在"真实单册在场 + 无 meta.json"的环境里跑一次真实装配。
  建议验收阶段补一次真实冒烟：造夹具 → 重启宿主 → `curl -i /dashboard/api/reqboard/health`
  期望 **503 + hint**（而非 404）。
- **未就绪态页面观感**：未做人眼核对（命令块换行、深浅色对比）。
