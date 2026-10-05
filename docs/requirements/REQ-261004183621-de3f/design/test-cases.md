---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
sides: [backend]
---

# 设计 · 测试策略与验收口径（REQ-261004183621-de3f 归档清单对账）

## 测试策略总览 `serves: FR-1, FR-6`

| 层 | 覆盖什么 | 手段 |
|---|---|---|
| 领域单测 | 豁免规则匹配（含显式负例）、规则常量形状 | 纯函数直调（无 IO） |
| 用例单测 | 对账三分类、拒绝零写入、`unlisted_ack` 三态、补录幂等/守卫、`warn` 回退 | 临时目录 fixture + 现有 harness |
| 配置单测 | `unlistedGate` 解析（缺省/合法/非法） | `archiveGateSetting()` |
| 看板渲染 | 对账行计数、老记录"未对账"、未列明细折叠 | 视图函数直调（沿用既有 `verification.ts` 测试风格） |
| 门禁 | 构建 / 类型 / 测试基线 / kb:check | C-11、C-12、C-13、C-14、C-15 |

**fixture 目录（单测用）**：

```
docs/requirements/REQ-TEST/
  requirement.md  decomposition.md  verification.md      ← 必填三件（已列）
  rtm-design.yml  rtm-implementing/t-x.yml  queue.json    ← 命中豁免
  state/x.json                                            ← 命中豁免
  tasks/t-1.md  evidence/x.txt                            ← 未列（本需求的核心场景）
```

## 用例表 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| # | 用例 | 期望 | 服务 |
|---|---|---|---|
| T1 | 对账分类 | `listed ∪ exempted.path ∪ unlisted` = 目录文件全集；三者两两不相交 | FR-1 |
| T2 | 豁免命中 | `rtm-*.yml` / `rtm-implementing/*` / `queue.json` / `state/*` 进 `exempted` 且带 rule id | FR-3 |
| T3 | 豁免负例 | `tasks/t-1.md`、`evidence/x.txt`、`design/a.md`、`tests/t.md`、`reviews/r.md` **不**进 `exempted` | FR-3 |
| T4 | 未列即拒（enforce） | 有未列且无 `unlisted_ack` → 错误码 `REQBOARD_UNLISTED_ACK_REQUIRED`；**台账与队列写入序号不变** | FR-2 |
| T5 | `unlisted_ack` 覆盖不全 | 只声明一部分 → 拒；错误信息列出缺处置的 path | FR-2 |
| T6 | `unlisted_ack` 非法项 | path 不在未列集合 / reason 为空 → 分别拒（`REQBOARD_INVALID_INPUT`） | FR-2 |
| T7 | 声明齐 → 通过 | `acknowledged` 含声明项与理由；评论留痕含理由 | FR-2, FR-5 |
| T8 | `warn` 回退 | `unlistedGate='warn'` → 不拒；`reconcile.gate='warn'`；`unlisted_files`/`warning` 仍在 | FR-6 |
| T9 | 补录追加 | 归档后补 3 条 → `docs` +3、`amendments` +1、评论 +1、状态仍 `archived` | FR-4 |
| T10 | 补录幂等 | 同批再调 → 全 `skipped`、`amendments` 不增、写入序号不变 | FR-4 |
| T11 | 补录守卫 | 非归档态 → `REQBOARD_BAD_STATUS`；非本窗口需求 → `REQBOARD_NOT_BOUND_TO_WINDOW` | FR-4 |
| T12 | 补录不碰冷侧 | 补录前后 `verification.md` / `merged_into` / `manual_updates` 逐字不变 | FR-4 |
| T13 | 看板对账行 | 渲染含「已列 N · 豁免 N · 未列 N · 闸门=…」；老记录显示"未对账" | FR-5 |
| T14 | 配置解析 | 缺省 `enforce`；`warn` 合法；`'block'` → 装配期抛错 | FR-6 |
| T15 | 存量兼容 | 无 `reconcile` 的老记录：详情透传不报错、看板不显示 0 | FR-5, FR-6 |
| T16 | 既有归档回归 | 归档必填/合并去向/知识沉淀既有用例全绿 | FR-6 |

## 可执行验收命令与期望 `serves: FR-6`

```bash
# 1) 领域 + 用例 + 配置 + 渲染（本需求新增四套）
npx vitest run tests/archive-exemptions.test.ts tests/archive-reconcile.test.ts tests/archive-amend.test.ts tests/archive-manifest-view.test.ts
#    期望：四套全绿（T1–T15）

# 2) 归档既有回归（T16）
npx vitest run tests/acceptance-archive.test.ts tests/artifact-gates.test.ts tests/doc-sync.test.ts
#    期望：全绿（失败数不超过改动前基线）

# 3) 工具 schema 与契约
npx vitest run tests/tools-schema.test.ts tests/output-contract.test.ts
#    期望：全绿（新增 unlisted_ack / reqboard_archive_amend / reconcile 字段已在 schema 里）

# 4) 真实验收演练（脚本化，证据落 evidence/）
npx tsx scripts/archive-reconcile-drill.mts        # 新增演练脚本（见下）
#    期望：漏列 → 拒绝；声明豁免 → 通过；补录 3 条 → 清单变长；warn 模式 → 不拒

# 5) 门禁（C-11 / C-13 / C-14 / C-15）
pnpm build            # exit 0（host + client）
npx tsx scripts/kb-build.mts --check   # exit 0（改源码后先 --write 重算）
pnpm typecheck        # 错误数 ≤ 223
pnpm test             # 失败数 ≤ 基线（改动前同窗口实测 97）
```

## 演练脚本设计（真实验收的骨架） `serves: FR-1, FR-2, FR-4`

`scripts/archive-reconcile-drill.mts`：在**临时工作区**造一个假需求目录（含豁免项与未列项），直接调用用例（不经工具壳）依次演示：

1. 只列必填三件 → 期望 `REQBOARD_UNLISTED_ACK_REQUIRED`，并打印未列清单；
2. 加 `unlisted_ack` 覆盖 → 期望成功，打印 `reconcile`；
3. 调补录追加 3 条 → 打印 `appended` / `skipped`；
4. 同一批再补一次 → 期望全 `skipped`（幂等）；
5. `unlistedGate='warn'` 重跑第 1 步 → 期望不拒。

输出重定向到 `evidence/archive-reconcile-drill.txt`。

## 门禁与基线 `serves: FR-6`

| 门禁 | 命令 | 阈值 / 期望 | 依据 |
|---|---|---|---|
| 构建 | `pnpm build` | exit 0，两侧产物更新 | C-11 |
| 客户端重建 | `pnpm build:client` | `[verify-client] OK` | C-12 |
| 知识层自检 | `npx tsx scripts/kb-build.mts --check` | exit 0（改源码后先 `--write`） | C-13 |
| 测试 | `pnpm test` | 失败数 ≤ 基线 97（改动前同窗口实测） | C-14 |
| 类型 | `pnpm typecheck` | 错误数 ≤ 223 | C-15 |

## 手工验收 `serves: FR-2, FR-5`

1. 用本需求自己的归档流程走一遍：清单**故意少列一份** → 看板/工具回执显示拒绝与两种处置（不是沉默警告）。
2. 补齐后归档 → 看板归档页看到「已列 N · 豁免 N · 未列 0」。
3. 归档后补录一条 → 看板清单变长、评论多一条、状态仍为已归档。
