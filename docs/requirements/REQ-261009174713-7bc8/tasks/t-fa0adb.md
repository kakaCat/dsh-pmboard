# t-fa0adb 类型提示词片段按类型切分·研发

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
类型提示词片段按类型切分·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-09T12:06:21.098Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

第一期（文案收口期）完成：片段旧落点改指真实落点并删掉 t5 挂的探针白名单；新增按类型条数门禁（通用 21 加六类各 18），缺失即点名。第二期（片段文件搬进六个类型包 + core 经注册表消费）待接线决策。

### 完成项

- 文案收口：decomposing/heavy 改用完整可达路径 packages/pmboard-common/src/limits.ts；light 因 2500 上限用包目录形态 packages/pmboard-common（实测 2495 不超限）
- 同步 tests/fixtures/stage-prompts-baseline-p1.json 两条目的同一行（文案改了基线必须跟着走）
- 删除 scripts/prompt-path-probe.mts 里 t5 挂的白名单条目——token 已不复存在；白名单产物名计数 28→27、真实存在 10→12
- 新增条数门禁：check-prompt-fragments.mjs 断言通用 21 条与六类型各 18 条，并禁止基线外类型；条数不符即 exit 1 并点名类型与差值
- 判据非空转实测：移走 fragments/decomposing/chore.md → 门禁红并报「chore：期望 18 条，实际 15 条」；还原后复绿
- 验收三行全绿：inline 与 check 退出码 0；条数 21 加 18×6 对账；pnpm prompts:check 退出码 0
- 第二期未做（有意）：片段文件物理分居六个类型包需要 core 经注册表拿片段的接入口，该口与 t10/t12 的分层收口耦合，计划漏了这条依赖

### 改动文件

- `.worktrees/req-261009174713-7bc8/src/domain/prompt/fragments/decomposing/heavy.md`
- `.worktrees/req-261009174713-7bc8/src/domain/prompt/fragments/decomposing/light.md`
- `.worktrees/req-261009174713-7bc8/tests/fixtures/stage-prompts-baseline-p1.json`
- `.worktrees/req-261009174713-7bc8/scripts/prompt-path-probe.mts`
- `.worktrees/req-261009174713-7bc8/scripts/check-prompt-fragments.mjs`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-common/src/prompt/generated/fragments.ts`

### 下一步

第二期待定序：建议在 t12（core 落位）之后，把「片段表进六个类型包 + 注册表下发」与 t10（core 类型逻辑单点化）同批做，那时才有合法的接入口。在此之前本卡不关。

---
## 汇报 2（2026-10-09T14:23:54.433Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

二期准备步（A）完成：把模块级 FRAGMENT_LIBRARY 常量改为惰性记忆化访问器，消除「导入顺序 vs 装配顺序」陷阱；行为等价（235 例提示词用例全绿、条数基线不变、全量读数不变）。

### 完成项

- 改动：domain/prompt/index.ts 的 FRAGMENT_LIBRARY 常量 → fragmentLibrary() 惰性记忆化；resolveStagePrompt 的 library 改为可选并在内部回落 fragmentLibrary()
- 为什么必须先做：二期要让类型片段经装配端口进 core，而常量会在本模块**首次被 import** 时求值——那次 import 完全可能早于装配点，读到「未装配」中间态（按 t10 的 fail-loud 口径会当场抛，且是假故障）
- 消费点 17 处已改（含多行 import 列表的形态修复），typecheck 0
- 行为等价证据：tests/prompt-categories 与 prompt-gates 与 prompt-tiers 与 design-prompt-registration 与 prompt-baseline 共 5 文件 235 例全绿
- 条数门禁不变：通用 21 · 六类型各 18；全量 7253 例失败 19（唯一飘项 settings-init，属既有抖动）
- 二期待做（清单见 HANDOFF）：生成器拆两处输出 → 六个类型包 src/fragments.ts；聚合点经端口把片段表装进 core；check-prompt-fragments 的条数基线改按文件数

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/domain/prompt/index.ts`
- `.worktrees/req-261009174713-7bc8/tests/prompt-categories.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/prompt-gates.test.ts`

### 下一步

二期正题：按 HANDOFF「t11 二期施工方案」的 (B)(C) 做——生成器拆输出、端口下发、计数门禁改按文件数；此后 prompts:check 与全量失败集都要复跑。

---
## 汇报 3（2026-10-09T14:27:55.821Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

二期完成：类型档片段拆进六个类型包（各 18 条）、通用 21 条留 common、core 组装 = 通用 + 经端口下发的类型档；生成链与计数门禁按文件化，验收三行全绿。

### 完成项

- 生成器拆两处输出：common 产物只留通用 21 条；新增 buildTypeFragmentsSource(cat) 产 packages/pmboard-type-<cat>/src/fragments.ts（各 18 条）
- 计数门禁按文件化：通用在 common 产物里（并断言只有 category=*）、六类各自在自己的产物里（断言不串类）；条数基线仍是 21 + 六类各 18
- core 组装接通：fragmentLibrary() = GENERIC（common）+ typeFragments()（端口下发）；类型档未装配即抛，不静默只注入通用档
- 装配点接线：src/type-registry.ts 引入六包 FRAGMENTS 并 installTypeFragments（core 仍不认识任何具体类型包）
- 验收一：node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs 退出码 0
- 验收二：条数基线 通用 21 · feature 18 · bug 18 · doc 18 · refactor 18 · spike 18 · chore 18
- 验收三：pnpm prompts:check 退出码 0（含探针缺口 0）
- 读数：typecheck 0、提示词面 7 文件 248 例全绿、全量 7253 例失败 19（唯一新增项 header-progress-e2e 是反复飘的既有抖动项）

### 改动文件

- `.worktrees/req-261009174713-7bc8/scripts/inline-prompt-fragments.mjs`
- `.worktrees/req-261009174713-7bc8/scripts/check-prompt-fragments.mjs`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-common/src/prompt/generated/fragments.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-type-feature/src/fragments.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/type-registry-port.ts`
- `.worktrees/req-261009174713-7bc8/src/type-registry.ts`

### 下一步

交复核子卡 t-6333df：独立复跑三行验收并核对「类型档不再留在 common 产物里」。P.S. 我在 t5 挂的探针白名单条目已在卡 t11 一期删除，本期无新增白名单。

---
