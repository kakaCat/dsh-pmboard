# REQ-261002105242-a3fb 测试证据（可复核命令与输出摘要）

> 采集时间：2026-10-02 · 采集人：窗口 agent · 环境：本仓工作区 / Node + vitest 2.0.0
> 原始输出另存：`evidence/pre-fix-red.txt`（修前必红）、`evidence/probe-live-output.txt`（真实数据探针）

## 1. 修前必红（实施第一步的基线，证明缺陷真实存在）

```bash
npx vitest run tests/archived-entry.test.ts
# → Tests  11 failed | 3 passed (14)
#   红：A1-1 A1-2 A1-3 A1-4 A3(canceled/done) A4 A5×2 A6×2
#   绿：A2（详情渲染能力本就没丢）、A3(archived)、A6(进行中投影)
# 完整清单见 evidence/pre-fix-red.txt
```

**读法**：11 条红 = 缺陷本体（归档需求在看板上不可达 + 终态会渲染假按钮 + 僵尸入口在场）；
3 条绿 = 本来就没坏的部分（数据与渲染能力一直在，这正是"数据没被收回"的机械证据）。

## 2. 实施后：判据用例

```bash
npx vitest run tests/archived-entry.test.ts
# → Test Files 1 passed (1) · Tests 14 passed (14)
```

```bash
npx vitest run tests/archived-entry.test.ts tests/board-info-fixes.test.ts tests/client-view.test.ts tests/token-card.test.ts
# → Test Files 1 failed | 3 passed (4) · Tests 1 failed | 85 passed (86)
#   唯一红项：board-info-fixes「jumpResultMessage：可跳不打扰，不可跳必须说清原因」
#     —— 既有基线问题，与本需求无关：断言来自 HEAD（不在工作区 diff 中），
#        且 HEAD 的 src/client/board-mount.ts:139 文案本就不含「暂不可用」字样。
#        本需求不修它、不掩盖它（修则超出需求边界；掩盖则违反"失败要响亮"）。
```

## 3. 真实数据端到端探针（人工浏览器核对的机械版）

```bash
npx tsx docs/requirements/REQ-261002105242-a3fb/evidence/probe-archive-entry.mts
# → exit 0 · ✅ 探针全绿（完整输出见 evidence/probe-live-output.txt）
```

探针取**看板真实 API** 的 state（不伪造 fixture），跑同一批渲染函数：

| 断言 | 结果 |
|------|------|
| 真实数据规模 | 需求 29 条（归档 21 / 取消 0）、任务 553 张；锚点 `REQ-261001213924-1441` **39 张卡** |
| A1-2 归档条在场、默认折叠、泳道段零泄漏 | ✓（21 条归档 + 0 条取消，一个都没混进泳道） |
| A1-2 归档 chip 带任务进度 | ✓ `39/39` |
| A2 详情含 DAG 画布 + 任务行数 = 真实任务数 | ✓ `dsh-pm-dag-panel` + **39 行** |
| A3 归档详情无任何操作按钮 / 无操作条容器 | ✓ |
| A4 列表终态分组标题与计数含归档 | ✓「已完成 / 已归档 21」 |
| A4 归档行可被翻到（pageSize=50） | ✓（默认 10/页时在后续页，故泳道归档条是常驻入口） |
| A6 两投影互斥且并集 = 全部需求；归档仍带全部任务 | ✓ |

## 4. 静态与构建（仓库规范 C-15 / C-12）

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
# → 197        （基线 223，本次改动文件零新增错误）

pnpm build:client
# → [verify-client] OK  bundle=335555 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
```

## 5. 全量回归（仓库规范 C-14）

```bash
npx vitest run
# → Test Files 49 failed | 250 passed | 3 skipped (302)
#   Tests      98 failed | 2991 passed | 20 skipped (3109)
#   基线（kb conventions C-14）：106 failed / 2807 passed
#   本次：失败 98 ≤ 106 且通过 2991 ≥ 2807 → 无新增失败
```

## 6. 残留检查（FR-4）

```bash
grep -rn "archiveReq\|archive-req" src   # → 无输出（exit=1），连注释字面量都已清除
```

## 7. 与设计文档的偏差（显式记账，供验收）

| # | 偏差 | 处置 |
|---|------|------|
| 1 | 计划 t1 的验收预期「A2 在 t1 时仍红」——实测 A2 一开始就绿（它锁的是"详情渲染能力没丢"，t1 没动它） | 判据不改，作为回归锚点保留；在 t1 完工记录中如实说明 |
| 2 | design/test-cases.md「需同步修订的既有用例」只列了 2 条，实际有第 3 条：`tests/client-view.test.ts` 的「归档/取消不进泳道」原先断言**整页**不含这两个 id，归档条回归后必然红 | 按真实语义精确化为「泳道段不含 + 归档条段含」，并在 t2 完工记录点名；未回改已确认的设计文档（避免为一行清单重开人工门），偏差在此显式登记 |
| 3 | 清单第 3 条同理：`tests/board-info-fixes.test.ts` 的 live 断言除翻转项外还有一条既有红（jumpResultMessage） | 仅上报，不修 |

## 用例 ↔ 任务卡覆盖对照（covers 标注，供 RTM 追溯）

> 逐条对应 `tests/archived-entry.test.ts` 里的用例组；父卡与承载它的子卡都在同一组里标注。

### TC-1 归档条渲染与终态投影（A1-1 / A1-3 / A1-4 / A6）
covers: t-f84476, t-2d4f3e, t-a587a7
validates: FR-1, FR-5

### TC-2 泳道归档条接线与列表终态分组（A1-2 / A2 / A4）
covers: t-fbd1b3, t-aa4b50, t-e62d4f, t-5a2b9e
validates: FR-1, FR-2, FR-3

### TC-3 终态只读：archived / canceled / done 恒不渲染操作条（A3）
covers: t-5074a4, t-52fa03, t-aeab92
validates: FR-2

### TC-4 僵尸归档入口清零与旧调用方收敛（A5）
covers: t-473ad6, t-ba1b08, t-f81376, t-94e346
validates: FR-4

### TC-5 全量回归 / 类型 / 构建 / 真实数据端到端（A7）
covers: t-c346ec, t-263eb9
validates: FR-5
