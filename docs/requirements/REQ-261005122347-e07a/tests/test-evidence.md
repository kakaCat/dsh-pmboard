# 测试证据 · 收录 UI 提示词并按引用交付原型 subagent（REQ-261005122347-e07a）

> TL;DR：新增 **4 个测试文件 / 45 条用例**，把「资产完整性 · 投放幂等与事务 · 指纹与清单契约 ·
> 注入节五要素与可裁」四条线锁死；提示词侧既有 **327 条**用例全绿；指定回归失败数与开工基线持平（1）。

## 一、用例清单

| 文件 | 条数 | 锁什么 |
|---|---|---|
| `tests/skills-assets.test.ts` | 8 | 7 个 SKILL.md + 检索脚本在盘 / 清单与目录双向一致 / 体积 ≤5MB / 不该进包的东西不在（自测·字体·两个大 JSON·字节码）/ 打包清单含 skills / 读不到即响亮报错 |
| `tests/skills-materialize.test.ts` | 10 | 幂等（第二次 reused=true 且 mtime 不变）/ force 重写 / 损坏自愈 / 事务性（只读目录 → WRITE_FAILED 且无 `.tmp-*`、目标目录不存在）/ 解释器回执 / 开关关闭不写盘 / 缺资产报路径 / 未知 skill / 只投子集 |
| `tests/skills-provenance.test.ts` | 17 | 自带资产说明形状 / 指纹逐文件核对 / **篡改必红**（改哈希·删文件·多文件·版本不认识）/ 清单构造与比对 / 缺清单视为未投放 / 配置解析非法值抛错 |
| `tests/skills-injection.test.ts` | 10 | 注入五要素 / 无 `${CLAUDE_PLUGIN_ROOT}` 占位符 / 该节 ≤1200 且重档 ≤24000 / **可裁反向演练**（压预算即被裁、floor 仍在）/ 只进重档、轻档守 2500 |

## 二、用例运行摘要（可复核）

```
$ npx vitest run tests/skills-assets.test.ts tests/skills-materialize.test.ts \
                 tests/skills-provenance.test.ts tests/skills-injection.test.ts
 Test Files  4 passed (4)
      Tests  45 passed (45)
```

需求文档「判定标准 3」点名的既有用例一并复核：

```
$ npx vitest run tests/stage-prompts.test.ts tests/prompt-cost.test.ts tests/prompt-tiers.test.ts \
                 tests/prompt-baseline.test.ts tests/skills-assets.test.ts tests/skills-materialize.test.ts \
                 tests/skills-provenance.test.ts tests/skills-injection.test.ts
 Test Files  8 passed (8)
      Tests  145 passed (145)
```

提示词体系全套（含路由壳不变量、孤岛门禁、产物一致性）：

```
$ npx vitest run tests/prompt-*.test.ts tests/stage-prompts.test.ts tests/node-panel-process-map.test.ts \
                 tests/design-prompt-registration.test.ts tests/kb-prompt-wiring.test.ts
 Test Files  11 passed (11)
      Tests  327 passed (327)
```

## 三、门禁与回归（与开工基线比对）

| 项 | 命令 | 开工基线 | 交付时 |
|---|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 1 条 error TS | **0** 条（本需求新增 0） |
| 指定回归 | `npx vitest run tests/reqboard tests/application tests/http` | 1 failed / 569 passed | 1 failed / 577 passed（失败数未增） |
| 全量套件 | `npx vitest run` | 69 failed | 69 failed / 5104 passed（未增） |
| 指纹门禁 | `node scripts/vendor-skills.mjs --check` | — | exit 0（28 条一致 / 2,801,800 B） |
| 片段一致性 | `node scripts/check-prompt-fragments.mjs` | — | exit 0 |

**失败归属核对**：全量套件 37 个失败文件逐个核对，**无一是本需求的 `tests/skills-*.test.ts`**。

## 四、端到端（人可复核）

```
# 1) 投放（真写盘）
$ npx tsx /tmp/skillse2e/e2e.mts        # 见 notes/search-e2e-output.txt 的取证脚本
  第一次 reused=false，写入 7 个 skill，144 文件，2,796,904 B
  第二次 reused=true，materialized=[]，mtime 未变
  回执 searchScript = /tmp/skillse2e/ws/.dsh/skills/ui-ux-pro-max/scripts/search.py

# 2) 按注入节的命令模板、用回执给的绝对路径原样跑
$ python3 <回执 searchScript> "internal analytics dashboard" --design-system --variance 8 --density 8
  exit 0；stdout 8576 B；含 PATTERN / STYLE / COLORS / TYPOGRAPHY 段

# 3) 注入节只进重档
  heavy.text 含「原型工作原则」= true；light.text 含 = false
```

## 五、反向演练（两处，实跑并还原）

| 演练 | 反转动作 | 期望 | 实测 |
|---|---|---|---|
| 指纹门禁承重 | sha256 比对改为 `if (false)` + 篡改一字节 | 门禁空转 | `--check` **exit 0**（篡改被放过） |
| 本节可裁承重 | 片段优先级 10 → `floor` + 重生成 | TC-13 必红 | **1 failed / 9 passed** |

两处反转的脚本改动已 `diff -q` 验证逐字节还原；还原后门禁恢复绿。
留档：`notes/vendor-drift-drill.md`、`notes/nonfloor-drill.md`。

## 六、未达成项（如实登记）

`pnpm kb:check` 仍 exit 1，两个原因均非本需求所致：他人在飞的 3 个未归类脚本
（`.probe` / `rework-inverse-verification.mts` / `rollback-landing-replay.mts`），以及 `code-map` 是
全仓源码派生物而另一窗口正在持续改源码（实测符号数 2878→2880→2881 递增，无法收敛）。
详见 `notes/verification-summary.md` §3。

## 七、任务覆盖标注（covers）

本需求共 5 张父卡 + 19 张子卡，逐卡对应的测试/门禁证据如下。

### 父卡

- covers: t-540c7e —— 资产与指纹：`tests/skills-assets.test.ts`（8）+ `node scripts/vendor-skills.mjs --check`
- covers: t-8e7e19 —— 契约与开关：`tests/skills-provenance.test.ts`（17）+ `tests/layer-boundary.test.ts`（存量越界）
- covers: t-41cc65 —— 投放工具：`tests/skills-materialize.test.ts`（10）+ `tests/skills-assets.test.ts`（8）+ 端到端实跑
- covers: t-ebb03c —— 注入节：`tests/skills-injection.test.ts`（10）+ `tests/prompt-tiers.test.ts`（40）+ `tests/prompt-baseline.test.ts`（15）
- covers: t-36dca3 —— 回归收尾：`notes/verification-summary.md` + 两处反向演练记录

### t-540c7e 子卡链

- covers: t-1cf5ef —— 研发：`node scripts/vendor-skills.mjs`（exit 0）+ `--check`（exit 0）
- covers: t-2a5f00 —— 联调：`tests/skills-assets.test.ts` + `tests/skills-materialize.test.ts`（18 passed）
- covers: t-6eeb00 —— 复核：`notes/design-deviations.md` + `notes/trim-decision.md`
- covers: t-41d951 —— 测试：全量套件（69 failed ≤ 基线）+ `npx tsc --noEmit`（0）

### t-8e7e19 子卡链

- covers: t-d906fe —— 研发：`tests/skills-provenance.test.ts`（17 passed）
- covers: t-77f23e —— 联调：`tests/skills-provenance.test.ts` 在真实资产上逐项成立
- covers: t-962542 —— 复核：契约边界用例（缺清单 / 版本不认识 / 内容变 / 少 / 多）
- covers: t-ee1b25 —— 测试：`tests/skills-provenance.test.ts`（17）+ tsc 新增 0

### t-41cc65 子卡链

- covers: t-4f6eb6 —— 研发：`tests/skills-materialize.test.ts` + `tests/skills-assets.test.ts`（18 passed）
- covers: t-d3f86b —— 联调：回执路径 ↔ 注入命令模板实跑（exit 0 含 PATTERN）
- covers: t-82ef4e —— 复核：5 个错误码齐备 + 事务性用例
- covers: t-ed7240 —— 测试：28 用例全绿；tsc 新增 0；全量失败数未增

### t-ebb03c 子卡链

- covers: t-e6e79b —— 研发：`tests/skills-injection.test.ts`（10 passed）
- covers: t-b9e07e —— 联调：注入节与投放回执咬合（重档含 / 轻档不含）
- covers: t-2dba59 —— 复核：五要素 + 691 字符 ≤1200 + 不触碰路由算法
- covers: t-4e790a —— 测试：提示词 11 份用例 327 passed；tsc 新增 0

### t-36dca3 子卡链

- covers: t-5e4bf8 —— 研发：`pnpm kb:build` + 规范页 C-22 + 架构篇第八节 + 两处反演实跑
- covers: t-119344 —— 复核：两份演练记录在盘且含反演与还原记录
- covers: t-a5cc87 —— 测试：`notes/verification-summary.md`（门禁逐项 + 外部阻塞核查）

