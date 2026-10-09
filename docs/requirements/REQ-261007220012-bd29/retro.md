# 复盘（retro）：工具面精简 27 → 21（REQ-261007220012-bd29）

> 类型：refactor ｜ 窗口：session-9a0e68f7 ｜ 2026-10-07 ｜ 33 张任务卡（7 父 + 26 子）全 done，验收 8/8 通过后归档。

## 一、做对了什么

| # | 做法 | 证据/收益 |
|---|------|-----------|
| 1 | **设计阶段就把四个新接口契约定死**（ask_confirm+ticket / status.run / task_tree(task_id) / task_amend(op)），实施逐字照做 | 四个合并点没有一次返工；`design/interfaces.md` 与实施逐条对得上 |
| 2 | **分组批处理 + 每批同一类改动**（删 / 并入取件口 / 并入查询面 / 合一簇 / 改名 / 单源化） | 六批各自可单独 revert；复核阶段「一次只改一类」的核查一次通过 |
| 3 | **等价性靠两层证据**：原用例测试全绿 + 壳层测试换入口复跑 | 10 文件 71 例（等价组）+ 9 文件 150 例（契约矩阵） |
| 4 | **每批都做「失败文件 ∩ 本批触碰测试 = 空集」**的差分读数 | 在共享工作树上把「新增红 0」论证成了可复核事实，而不是感觉 |
| 5 | **五处口径派生校验**（registry / 磁盘 / register / README / package.json） | 每批改完立刻知道漏没漏（本批四次计数推进 26→25→23→21 全程无漂移） |

## 二、踩到的坑（可复用教训）

1. **目录改名会漏掉「错误码清单」这个连带面**（S5 测试阶段红）：
   `tests/fixtures/error-code-inventory.json` 里 6 条大写码的 `site.file` 指旧路径。
   好在该门禁的报错自己给了修法（`npx tsx tests/drill/refresh-error-code-inventory.mts`）。
   → **教训**：改名/移动工厂文件时，把「错误码清单刷新」写进动作序列（已进 tool-face-inventory.md）。
2. **注入片段是第二个易漏面**（S2）：`src/domain/prompt/fragments/decomposing/heavy.md` 里提到旧工具名，
   改完必须 `node scripts/inline-prompt-fragments.mjs` 重新生成 `generated/fragments.ts`。
3. **「用例一行不改」这种断言必须按文件实测 diff 核，不能按印象说**（验收阶段自查纠正）：
   我先前写「六个被复用用例判定逻辑一行未改」，实测 `git diff` 后发现
   `TaskTree.ts` 是 **119 insertions / 2 deletions**（新增单卡展开分支），
   准确口径是「**五个**用例消息面/零改动 + TaskTree 新增分支、原逻辑保留」。
   → **教训**：等价性断言要落到「每个文件的 diff 行数 + 性质」，写进 `reviews/self-review.md` 的自查纠正节。
4. **共享工作树让「pnpm test 全绿」不可达**：树上同时载着另两条需求的未提交改动，
   起点就有 38 个失败文件；只能以**差分**为口径，并在验收材料里把口径说清（否则读者会误判）。
5. **两例既存 flaky 干扰判读**：`canceled-legacy-read`（告警文案断言受 mtime 缓存影响，3 次里 2 红 1 绿）、
   `settings-init`（临时目录路径断言）——都靠**隔离复跑**才判定与本次无关。
   → **教训**：全量红要先分诊（隔离复跑 + 文件交集），再决定是否算数。

## 三、数字

| 指标 | 值 |
|------|-----|
| 工具面 | 27 → **21**（删 7 壳、新增 1 壳、改名 1） |
| 同步面改动点 | index / registry / render-summaries / StageActions / shared / README / package.json / 契约测试 6 个 / 错误码清单 / 注入片段 |
| 新增测试 | `tests/task-amend-tool.test.ts`（6 例壳层契约）+ 各批重指向与收紧（合计约 12 个测试文件被改） |
| 契约矩阵 | 9 文件 / 150 例全绿 |
| 等价组 | 10 文件 / 71 例全绿 |
| 类型 | `tsc --noEmit` 0 错误 |
| 全量差分 | 逐批新增红 **0**（起点 38 个失败文件为他人在飞改动） |
| 数据迁移 | **0**（工具面是装配期事实） |

## 四、已知遗留（交给后续）

1. `tests/handoff.test.ts` 2 例长期红（`REQBOARD_DEPENDENCY_GATE`），与本次零交集。
2. `dist/` 未重建：新工具面要 `pnpm build` 后重载才在运行中的插件生效（本批有意不动，避免影响并行窗口）。
3. `reqboard_capture` 提问数口径三套并存（上一批遗留，仍未另立）。
4. 工作树的未提交改动属于多条需求，本批未做 git commit（避免裹入他人改动）——
   合并/提交策略需要一次专门裁决。
