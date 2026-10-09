# 测试用例：reqboard 体检第二批文案契约漂移修复（REQ-261007200706-89b7）

> 验收前置补档。每条用例 = 「目的 / 命令 / 期望」，命令可直接照抄执行。
> 负例与反向锁是本批的重点：**只判"改对了"不够，还要判"漂移回不来"**。

## 用例矩阵 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

| 编号 | 目的 | 命令 | 期望 |
|------|------|------|------|
| TC-1 | 死路径清零 | `grep -rn "agent-dh/docs/architecture/requirement-archive\|docs/standards/tool-development" src --include=*.ts` | 0 命中 |
| TC-2 | 探针扩面 + 禁词规则不空转 | `npx tsx scripts/prompt-path-probe.mts --specimen --json` | `specimen` 五键全 true，`exitCode=0` |
| TC-3 | **负例**：真实仓注入死指针必红且点名 | 在 `src/tools/` 建临时 `.ts`（内容含 `templates/probe-negative-missing.md` 与 `agent-dh/docs/...`）→ 跑探针 → 删除 | 注入时 `exit 1` 且两条逐一点名（含正确 `文件:行`）；删除后 `exit 0` |
| TC-4 | 既有扫描面不回归 | `git show HEAD:scripts/prompt-path-probe.mts > /tmp/old.mts`，分别跑旧/新探针 `--json` | 旧面 token 集合 ⊆ 新面 token 集合（差集空），旧面新增缺口 0 |
| TC-5 | 问数口径唯一 | `grep -rn "三问\|四问\|五问" src README.md --include=*.ts \| grep -v QueryReport.ts` | 仅命中 `capture-mapping.ts`（事实源） |
| TC-6 | `doc_location` 补齐 | `grep -n doc_location src/tools/CreateTool/prompt.ts` | 命中（弹框逐问 + 手工参数两处） |
| TC-7 | submit 预算 | `npx vitest run tests/submit-prompt-budget.test.ts` | 5 passed；其中 `SUBMIT_PROMPT.length ≤ 1300` |
| TC-8 | 细则下沉未丢 | 同上（第 ③④⑤ 条用例） | sides / 失败与并发路径节 / archive 分类限定 / plan 三处源地的 message 断言全过 |
| TC-9 | 六支一致 | 同上（第 ② 条） | prompt 的 `kind=` 六支与 `SUBMIT_DISPATCH` 键集一致；`五类`／`五个提交入口` 不在场 |
| TC-10 | 叙事清零 | 脚本按「注释 / 字符串」分类统计 `src/tools` 内 REQ 编号 | 非注释命中 0；`RUN_STATUS_PROMPT.length=663 < 810` |
| TC-11 | 注记分级（正向） | `npx tsx` 打印注册字段的运行时 description | 幂等 5 字段全有 `拆成多次调用` + 写法锚点 |
| TC-12 | **反向锁**：一次性字段不得有危险指引 | `npx vitest run tests/arg-guidance.test.ts` | 13 passed；TC-2b 对 6 个一次性字段断言"写法锚点在场 + 不含 SPLIT" |
| TC-13 | 拦截清单定性化 | `npx vitest run tests/ask-confirm-prompt.test.ts` | 4 passed；「全部写路径」在场、旧四工具枚举与 9 个挂载工具名均不被枚举 |
| TC-14 | budget CAS 描述 | `grep -n "expectedWindowIndex（CAS 号）：与你看到的窗口号一致才换窗" src/tools/TaskMoveTool/TaskMoveTool.ts` | 命中 |
| TC-15 | 元数据残留 | `grep -c "13 个" cordis.patch.yml`；`python3 -c "import json;r=json.load(open('package.json'))['repository'];print('directory' in r, r['url'])"` | `0`；`False git+https://github.com/kakaCat/dsh-pmboard.git` |
| TC-16 | 行为等价（整批） | `npx vitest run` 前后同树对照 + `pnpm typecheck` + `pnpm prompts:check` + `pnpm build` | 失败集合新增 0；三命令 `exit 0` |

## 判据边界 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

- 探针只判「路径可达 + 禁词前缀」，**不判内容对不对**（内容归模板门禁与文档自检）。
- `.ts` 注释被剥离后再抽 token：**注释里的历史路径说明不算文案**（这是有意的，见 TC-1 的口径）。
- 同形异义的「状态查询四问」（`QueryReport.ts`）不属本批口径，TC-5 显式排除。
- 参数格式示例（`["FR-1","FR-2"]`）与字段规格引用不属"历史叙事"，TC-10 只判 REQ 编号。

## 既有红与抖动（基线说明） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

工作树带着其他需求未提交的在飞改动，故**仓库基线文件是脏的**：`tsx scripts/test-baseline.mts --check`
在本批开工前即 FAIL。本批的等价判据是**同树 A/B**（回退本批改动前后各跑一遍，比对失败集合），
逐卡与整批均新增红 0。已知并行抖动用例：`canceled-legacy-read.test.ts`、`reqboard/settings-init.test.ts`
（单跑通过、全量偶红）；既有超限：`size-budget.test.ts`（含 `SubmitTool.ts` 517 行，改动前即 515 行）。
