---
req_id: REQ-261005151245-54ae
kind: tests
---

# 测试证据（机器层）

> 完整输出摘要、失败归属表与逐条点名见 `../evidence/checks.md`；本页只放**跑什么 → 看到什么**。
> 跑法一律文件级，任何人可复跑。

## 1. 主用例集（新增，57 条）

```bash
npx vitest run tests/open-window-inherit.test.ts
# → Test Files 1 passed (1) / Tests 57 passed (57)
```

| 分组 | 覆盖 |
|---|---|
| `increasedWindowTitle` | 无后缀追加 `(1)` / 半角 `(2)→(3)` / 全角 `（3）→（4）` / 非数字括号不算后缀 / 大序号 BigInt 不丢精度 |
| `readWindowProfile` | 端口缺失 / 宿主抛错 / 非对象返回（`undefined`、`null`）/ 空串与纯空白按缺失 / 三项齐全归一 / 模型读数缺一即缺席 |
| `presetInheritanceOf` | create 回带 `agentPreset`、fork 不回带、源无预设 `skipped`、画像读不到 `failed` |
| `applyWindowInheritance` | 显式标题优先 / 源标题递增 / 源无标题 `skipped` / 画像读不到三项 `failed` / 有显式标题时仅模式与模型 `failed` / rename 抛错不短路 / selectModel 抛错不短路 / 只缺写标题能力 / 只缺设模型能力 / 纯空白显式标题回退 / 非字符串与空推理档按缺失 / 空 sourceRead 三项 `failed`+原因未知 |
| openWindow（T-01~T-14） | fork 与 create 两条路径的标题、模式（请求体）、模型、三态回执、不短路、端口未装配、fork 只读一次画像 |
| 适配器（假宿主服务） | `projections` 入参 / 取投影 `next` / 只有 `lastUsed` 不算读数 / 空值按缺失 / 返回 null 抛错 / 宿主抛错原样抛 / 服务未装配抛错 / `rename` 入参 / `selectModel` 缺省不带 `reasoningEffort` / `create` 两形态请求体 |
| 兼容 | 旧替身三项 `failed` 不崩溃 / fork 回执键集合仅多 `inheritance` / 底稿投递键不被挤掉 |

## 2. 受影响既有套件（回归，合计 112 条）

```bash
npx vitest run tests/open-window-inherit.test.ts tests/open-window-tool.test.ts \
  tests/handoff-owner.test.ts tests/open-window-project-root.test.ts \
  tests/reqboard/settings-migrate-dispatch.test.ts tests/capture-window-bound-policy.test.ts
# → Test Files 6 passed (6) / Tests 112 passed (112)
```

`tests/handoff-owner.test.ts` 新增两条（新建窗口带回执 / 指定已有窗口整体省略）；
`tests/reqboard/settings-migrate-dispatch.test.ts` 新增两条（T-15 显式语义标题与三项 `set`；T-15b 旧装配三项 `failed` 不阻断迁移）。

## 3. 探针（真适配器 + 真用例 + 真继承模块，只换假宿主服务）

```bash
npx tsx scripts/open-window-inherit-probe.mts    # → exit 0
# source_title = 登录重构 (2)   child_title  = 登录重构 (3)
# source_preset = cordis        child_preset = cordis
# source_model = deepseek/deepseek-reasoner/high   child_model = 同
# total 0.81ms
```

## 4. 机器门禁

```bash
npx tsc --noEmit        # → 0 错误
pnpm build              # → 退出码 0（host dist + client lib/client.js，verify-client OK）
npx vitest run          # → 5466 passed / 68 failed；68 条逐条核对均不在本需求改动面
```

## 5. 待人工那一项

实机三处观察（侧栏标题 / 模式芯片 / 模型选择器）见 `../evidence/live-check.md`，**尚未执行**；
前置是 `pnpm build` 后重启插件（本次改的是 host 侧代码）。

## 6. 覆盖标注（covers → 任务卡）

> 口径：同一张卡的研发/复核/测试子卡共享该卡的交付面，故标注打在承载其测试的文件上。
> 25 张卡全覆盖（6 父卡 + 19 子卡）。

### tests/open-window-inherit.test.ts（含 openWindow / 适配器 / 继承模块 / 兼容）
covers: t-2e4376, t-bf84df, t-d685ff, t-a0e60b, t-3223b5, t-398b95, t-531d55, t-2789e5, t-5caa87, t-e3c003, t-cb4228, t-a2ff14, t-7fea40, t-56182a, t-bb1874, t-e6d703

### tests/reqboard/settings-migrate-dispatch.test.ts（迁移窗口：显式语义标题 + 回执三态）
covers: t-a65a55, t-65b261, t-11ada7, t-398c8b, t-93699c

### scripts/open-window-inherit-probe.mts + evidence/checks.md（探针与机器自检）
covers: t-6e1a6c, t-72133a, t-baac03, t-c6241f
