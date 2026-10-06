# 测试证据（REQ-261006115829-dafb）

> 交付物是文档，所以证据 = **结构断言 + 现场实测对照 + 环境性读数**。
> 命令与输出均为 2026-10-06 交付日实跑，未做任何"应该能"式推断。
>
> **机读 `covers: t-xxx` 标注的落点在 `design/test-cases.md`**（机器只读 `verification.md` /
> `design/test-cases.md` / `test-cases.md` 三处解析任务覆盖度，见 accepting 覆盖度门禁）；
> 本文件是人读的完整证据台账，不重复写 covers，避免两处真相。

## 1. 结构断言（TC-1）

```bash
F=docs/guides/plugin-reload-troubleshooting.md
for s in 症状 判据 机制 处置 非目标; do printf '%s=' "$s"; grep -c "^## .*$s" "$F"; done
wc -l < "$F"; grep -c 'text/event-stream' "$F"; grep -c 'rev' "$F"; grep -cE '应该能|一般会' "$F" || true
```

输出摘要：

| 断言 | 实测 | 期望 |
|---|---|---|
| 五段各命中 | 症状=1 · 判据=1 · 机制=1 · 处置=1 · 非目标=1 | 各 1 |
| 行数 | 66 | ≤ 120 |
| `text/event-stream` 命中 | 1 | ≥ 1 |
| `rev` 命中 | 9（新增定标块后仍 ≥ 3） | ≥ 3 |
| 禁用语（应该能 / 一般会） | 0 | 0 |

## 2. 现场实测对照（TC-3）

`<host>` = `127.0.0.1:19387`（本机交付时实测）；`rev` 从 `/plugins/events` 的图帧里抄。

| 编号 | 命令 | 实测 | 期望 |
|---|---|---|---|
| C-1 | `curl -sS -i -m 3 http://127.0.0.1:19387/plugins/events` | `HTTP/1.1 200 OK` + `content-type: text/event-stream` | 200 + 事件流 |
| C-2 | 原样请求 `plugins/??dsh-pmboard/client.js&rev=30507b9b5434` | `200`（656260 字节） | 200 |
| C-3 | 同地址把 `rev` 改成 `deadbeefdead` | `404`（0 字节） | 404 |

`rev` 对拍：`grep -c 30507b9b5434 docs/guides/plugin-reload-troubleshooting.md` → `1`（条目里写的与现测逐字一致）。

**时效实证**：交付期间观测到 `lib/client.js` 于 `12:09:49` 被重建，构建戳 `cfd7e0c0d56c` → `33a6b5c8ce65`，
上一轮（11:55）的定标值 `rev=7e4b309ff26e` / 654117 字节随即失效——条目与 TC-3 都已写明「复跑重新取 `rev`」。

## 3. 入链断言（TC-2）

```bash
grep -rn 'plugin-reload-troubleshooting' docs/architecture/
```

输出：2 行，分别 `docs/architecture/project-manual.md:14` 与
`docs/architecture/plugin-runtime-prerequisites.md:46`；后者命中行含 `rev`。

## 4. 交付面断言（TC-4）

```bash
git diff -U0 docs/architecture/project-manual.md | grep -A1 'plugin-reload-troubleshooting'
git diff -U0 docs/architecture/plugin-runtime-prerequisites.md | grep '^@@'
```

输出：我的两个 hunk 分别是 `@@ -12,0 +14 @@` 与 `@@ -41,0 +42,6 @@` —— **纯增、零删除**。

**整树口径不可判（如实上报）**：`git diff --numstat docs/architecture/project-manual.md` 显示 3 处删除，
逐行核对属本工作树的既有改动（`gate-read-root` / `client-running-indicator` / kb 去重行），
另有一处 `+34` 行 hunk（第八节 UI/UX skill 资产）同属既有改动。本需求全程未写 `src/**`。

## 5. 类型检查

```bash
npx tsc --noEmit -p tsconfig.json
```

输出：**零输出、退出码 0**（无类型错误）。

## 6. 全量测试（不可判项，如实上报）

```bash
pnpm test
```

输出摘要：`Test Files 39 failed | 466 passed | 3 skipped (508)`；
`Tests 70 failed | 5932 passed | 22 skipped (6024)`；耗时 129.81s。

**为什么不判过**：本卡未采集「开工前基线」，无法做「失败数 ≤ 基线」的比较；本需求零 `src` 改动，
失败样例指向并行会话正在进行的源码改动（如 `tests/application/repository.test.ts` 的 REQ-id 格式用例、
`tests/adapters/failure-alert.test.ts` 的弹框指令壳用例）。按「读数未知不判」的口径上报，不粉饰为通过。

## 7. 知识层自检（不可判项，如实上报）

```bash
pnpm kb:check
```

输出摘要：`[drift] docs/knowledge/code-map.md`、`[drift] docs/knowledge/design-tokens.md`，
`EXIT=1`。

**归因**：这两份生成物的输入是 `src/**` 与客户端样式；本需求零 `src` 改动，且两份文件 mtime 为
`11:05:41`（早于本需求改动），同时并行会话正在写 `src/client/styles/report.ts` 等文件。
按 t3 卡内条件（「若因新增页面出现漂移」才 `kb:build`）本条件不成立，**未执行 `kb:build`**——
避免把并行会话尚未提交的改动固化进生成物。留人工裁决。
