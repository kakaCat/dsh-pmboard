# 评审报告：reqboard 体检第二批文案契约漂移（REQ-261007200706-89b7）

> 评审方式：本窗口自评审（无第二人）。纪律：每条结论附可复核命令/读数；不利证据如实列出。
> 评审对象：requirement.md 七条 FR、design/ 五份文档、decomposition.md 九张卡、9 张卡的实施留痕。

## 评审范围 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

九张父卡（t1~t9）全部 done，其中 t1~t8 各带"研发 + 复核"子卡（t2 另含联调、测试），t9 为验收单段卡。
本报告按 FR 归并复核，逐条给出「现场 / 修复 / 反证 / 结论」。

## 逐条结论 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

| FR | 现场（开工前） | 修复 | 反证（能证明判据非空转） | 结论 |
|----|---------------|------|------------------------|------|
| FR-1 | `src` 内 8 处死路径（`agent-dh/docs/architecture/requirement-archive.md`、`docs/standards/tool-development.md`）；探针扫描面只有 fragments + round-state | 8 处改指真实文档；探针扩到 `src/tools/**` + 注入串 + GUI 文案，加禁词硬规则并挂 `prompts:check` | 临时文件注入死指针 → 探针 `exit 1` 且逐条点名；authorized 负例见 `tests/prompt-path-probe-tools-surface.test.ts`；specimen 五条 | 通过 |
| FR-2 | 三/四/五问字样 25 个源文件 + README 并存；`CreateTool/prompt.ts` 漏列 `doc_location` | 全仓文案不数问数（事实源 `CAPTURE_QUESTION_IDS` 唯一）；弹框逐问与手工参数两处补齐 `doc_location` | grep 残留仅为事实源；`tests/submit-prompt-budget.test.ts` 与 capture 契约测试守 | 通过 |
| FR-3 | description 1966 字符、说「五类」且漏 prototype | 1289 字符、六类齐、细则下沉到拒绝回执 | `tests/submit-prompt-budget.test.ts` 5 passed（含四处细则之家真实 message 断言） | 通过 |
| FR-4 | agent 可见面 12 处 REQ 编号 + RunStatusTool 两段修复史 | 编号清零、修复史挪注释、描述 810→663 | 分类脚本统计非注释命中 0；`test-cases.md` TC-10 | 通过 |
| FR-5 | 「文本过大拆成多次调用」挂在 6 个一次性副作用字段上 | 常量两级化 + 两表分级（含补登 handoff） | `tests/arg-guidance.test.ts` 13 passed，TC-2b 反向锁 + 运行时 audit | 通过 |
| FR-6 | 拦截清单只列 4 个工具（实际挂 9 个）；budget CAS 参数父描述缺 | 改定性表述「本窗口全部写路径」；budget 父描述补 CAS | `tests/ask-confirm-prompt.test.ts` 4 passed（9 个真实挂载名逐一不被枚举） | 通过 |
| FR-7 | `cordis.patch.yml` 写「13 个」；`package.json` 残留 monorepo `directory` 与旧 url | 改不数数；删 `directory`、url 对齐 origin | grep 0 命中；`pnpm build` + `typecheck` exit 0 | 通过 |

## 证据复核 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

- 全量：`npx vitest run` → 68 failed / 6947 passed / 22 skipped（7037）；与本批开工前同树失败集合比对**新增 0**。
- 构建与检查：`pnpm typecheck` exit 0；`pnpm prompts:check` exit 0；`pnpm build` exit 0（verify-client OK）。
- 探针：`--specimen` 五条全 ✔ 且 exit 0；`--json` 显示 `counts.forbidden=0`、缺口 0、扫到 agent 文案面 76 份。
- 变更面：本批只改文本/注释/元数据 + 探针脚本；**未触碰任何判定逻辑与错误码**（逐卡 diff 可核）。

## 不利证据与遗留项 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

1. **仓库基线脏**：`tsx scripts/test-baseline.mts --check` FAIL 属开工前既有（工作树混有其他需求未提交改动），
   本批以同树 A/B 取代该判据；若他人需要干净基线，应在其他需求收工后 `--refresh`。
2. **既有超限**：`size-budget.test.ts` 红（`SubmitTool.ts` 517 行 > 400；本批改动前即 515 行，仅 +2 行注释）。
   是否拆文件属另一议题，不在本批边界内。
3. **并行抖动**：`canceled-legacy-read` 与 `reqboard/settings-init` 在全量并发下偶红、单跑通过；本批多次 A/B 已验证与改动无关。
4. **文案级行为变化（有意）**：拒绝回执 message 变长（FR-3 细则下沉）；`code` 与键结构不变。
5. **评审强度**：单窗口自评审，无第二人交叉复核——本仓当前流程即如此，如实声明。
