# 测试用例设计（REQ-261006115829-dafb）

> 交付物是文档，所以「测试」= **对文档的可核验断言 + 对判据命令的实测对照**，全部只读、可复跑。
> 命令里的 `<host>` = 当前宿主（2026-10-06 本机实测 `127.0.0.1:19387`），`<rev>` = 当次实测取到的 rev。
> **机读的任务覆盖度标注落在本文件**（门禁只读 `verification.md` 与本文件所在的用例三处解析标注）：
> 每个 TC 带一行 `covers: t-xxx`，任务卡落库后回填，值取自实际承接该卡验收的那几张卡。

## 测试策略总览 `serves: FR-1, FR-2, FR-3`

| 层级 | 测什么 | 方式 | 通过判据 |
|---|---|---|---|
| 契约 | 条目页五段齐全、命令齐全 | `grep` 断言（TC-1） | 五段标题各命中 1 次；C-1…C-3 各 1 条 |
| 结构 | 入链 ≥ 2、不是孤儿页 | `grep -rn` 入口页面（TC-2） | `project-manual.md` 与 `plugin-runtime-prerequisites.md` 各 ≥ 1 行 |
| 实时 | 判据命令与文中一致 | 依次跑 C-1…C-3（TC-3） | `200` / `200` / `404` |
| 边界 | 本次交付不碰运行时代码 | 与开工快照比对（TC-4） | 新增改动行只落在 `docs/**` |
| E2E | 报障者照条目走完一遍 | 人工：从症状走到处置（UC-1 / UC-2） | 30 秒内得到「刷新页面」或「真缺陷」的结论 |

## TC-1：条目页结构与五段齐全 `serves: FR-1`
covers: t-e6d1e3, t-2b9f5e, t-20b429

**测试目标**：条目页存在、五段都在、篇幅不失控。

**测试步骤**：

```bash
F=docs/guides/plugin-reload-troubleshooting.md
test -f "$F" && for s in 症状 判据 机制 处置 非目标; do printf '%s=' "$s"; grep -c "^## .*$s" "$F"; done
wc -l "$F"
```

**预期结果**：五段各输出 `=1`；`wc -l` ≤ 120。

**边界值**：段落数用 `^## ` 锚定，避免正文提到「症状」二字时计数虚高。

## TC-2：入链 ≥ 2（不是孤儿页） `serves: FR-2`
covers: t-4c36ac, t-804218, t-d15f42

**测试目标**：从两处入口都能一步点到条目。

**测试步骤**：

```bash
grep -rn "plugin-reload-troubleshooting" docs/ --include=*.md | grep -v "^docs/guides/plugin-reload-troubleshooting.md"
```

**预期结果**：≥ 2 行，分别来自 `docs/architecture/project-manual.md` 与
`docs/architecture/plugin-runtime-prerequisites.md`；后者那一行含机制词 `rev`（不是裸链接）。

**异常处理**：只命中 1 行 = 有一处入口漏挂 → 补齐后重跑。

**判据口径（2026-10-06 人裁定修订 · 返工项 v1-2）**：原第三条子判据「`git diff --numstat` 两页
删除列（第二列）= 0」在**共享工作树**下不可能成立——整页含并行会话的既有改动（实测 `project-manual.md`
有 3 处删除，逐行可点名归属到别的需求），会把「本卡没删东西」误判成红。已改为 **hunk 级判据**：

```bash
git diff -U0 docs/architecture/project-manual.md docs/architecture/plugin-runtime-prerequisites.md | grep '^@@'
```

判据：属于本次交付的 hunk **不含 `-` 行**（本次实测为 `@@ -12,0 +14 @@` 与 `@@ -41,0 +42,6 @@`，纯增）；
整页若出现删除行，必须能逐行点名归属（别的会话 / 别的需求），否则不算过。

## TC-3：判据命令对照（本次实测定标） `serves: FR-3`
covers: t-890bc5, t-fed663, t-55d1a4

**测试目标**：条目里写的判据命令，跑出来与条目写的期望一致（否则条目就是错的）。

| 命令 | 2026-10-06 12:11 实测输出（交付日定标值） |
|---|---|
| C-1 `curl -sS -i -m 3 http://127.0.0.1:19387/plugins/events`（看头部） | `HTTP/1.1 200 OK` + `content-type: text/event-stream` |
| C-2 抄图帧里的 `plugins/??dsh-pmboard/client.js&rev=30507b9b5434` 原样请求 | `200`（656260 字节） |
| C-3 同地址把 `rev` 改成 `deadbeefdead` | `404`（0 字节） |

**定标值的时效**（实测到的活例）：`rev` 由入口产物的 mtime / ctime / size 合成，**任何人重建客户端都会让它变**。
本次交付期间就观测到 `lib/client.js` 于 12:09:49 被重建、构建戳 `cfd7e0c0d56c` → `33a6b5c8ce65`，
上一轮（11:55）的定标值 `rev=7e4b309ff26e` / 654117 字节随之失效——**复跑时重新取 `rev`**，不要沿用上表数值。

**预期结果**：与上表一致。不一致时按 `design/interfaces.md`「判据命令契约」的分诊列处理，并把新读数回写本条。

**覆盖场景**：
- [x] 正常流程（噪声分支：C-2 → 404）
- [x] 边界值（C-3 证明宿主确实按 rev 校验）
- [x] 异常处理（C-1 失败 → 真缺陷分支，见 UC-4）

## TC-4：交付面只有 docs `serves: FR-1, FR-2, FR-3`
covers: t-4dc5f3

**测试目标**：本次交付不引入运行时代码改动。

**前置条件**：开工前先存一份工作树快照（**本工作树同时有其它会话的历史改动**，整树 `git status` 直接判会误红）。

**测试步骤**：

```bash
git status --porcelain > /tmp/tree-after.txt
diff <(sed 's/^??.*//' /tmp/tree-before.txt) <(sed 's/^??.*//' /tmp/tree-after.txt) | grep '^>' || echo 'NO_NEW_TRACKED_CHANGES'
grep -n '^??' /tmp/tree-after.txt || echo 'NO_NEW_UNTRACKED'
```

**预期结果**：新增（`>`）行只允许出现在 `docs/` 下；未跟踪文件只有需求目录与条目文件。
**判据**：出现任何 `src/`、`dist/`、`lib/`、`scripts/` 的新增改动 → 本用例失败（超出边界，回设计）。

## TC-5：返工口径——两处入口页的改动「只增不删」（hunk 级） `serves: FR-2`
covers: t-fcd6b0, t-b3071a, t-f42ec3

**测试目标**：本需求对 `docs/architecture/` 两页的改动**只增不删**，且这条断言在共享工作树里仍可判。

**测试步骤**：

```bash
git diff -U0 docs/architecture/project-manual.md docs/architecture/plugin-runtime-prerequisites.md | grep -E '^(@@|-)' | grep -v '^---'
```

**判据**：属于本次交付的 hunk **不含以 `-` 开头的行**；整页若出现删除行，必须能逐行点名归属。

**实测（2026-10-06 返工）**：我的两个 hunk = `@@ -12,0 +15 @@`（1 行）与 `@@ -41,0 +42,6 @@`（6 行），纯增；
整页 3 处删除分别落 `@@ -15 +18 @@`、`@@ -22 +25 @@`、`@@ -58 +62 @@`——都是别的会话在改的行（`gate-read-root` 行、
`client-running-indicator` 行、kb 去重行）。

**为什么改口径**：原「整页 `git diff --numstat` 删除列为 0」在共享/脏工作树下**必红**——别人的既有改动会被算到本卡头上。

## 覆盖度统计 `serves: FR-1, FR-2, FR-3`

| 需求条款 | 测试用例 | 覆盖状态 |
|---|---|---|
| FR-1 条目页 | TC-1、TC-4 | ✅ |
| FR-2 入口回链 | TC-2、TC-4、TC-5 | ✅ |
| FR-3 判据命令 | TC-3、TC-4 | ✅ |

## 不测什么 `serves: FR-1`

- DSH 桌面壳的转发实现、`@deepseek-ai/dsh-client-hmr` 的 SSE 行为（装机产物，不在本仓）——
  只按「实测输出」引用，不做本仓断言；
- 不新增自动化测试文件：交付物是文档，`pnpm test` 基线不因本需求变化（跑一次只为确认没连带打红）。
