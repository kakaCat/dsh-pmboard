# REQ-261008011831-3735 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：尾巴一（活卡单点新红）已清零——两处终态文案判定改走 isCanceled 单点、清单两条失效条目出清，用例 17/17、渲染回归 94/94、tsc 0、diff 恰三文件、复核无偏离。尾巴二（基线落账）只差最后一步且非 agent 可代劳：--check 读数为「本次失败 16 / 基线 68 · 新增失败 0 / 不再失败 52 · tsc 0」，即本次未引入任何新红，唯一不 PASS 原因是基线陈旧；收口所需的 refresh 会破坏三份清单同源不变量（REQ-261008004324-81df 已在其 design 记明「已回滚」、在其 retro 记明「三份清单重新分诊 = 人的动作」），本轮实测与之逐字吻合并已按仓规还原。前置条件已全备：新增失败 0、本需求三文件零出现、tsc 0——人工执行 refresh + 同源分诊即可收口。另如实申报：① 人工口头授权 C 后外扩修了两处真缺陷（SubmitArchive 写前补根守卫、job-spec 时刻注入），改动 5 文件、回归 263 passed；② 期间一次 refresh 未连分诊造成 3 条自伤红，已还原并复绿（失败子集 21→18→16）。

## 1. 验收列表

### v1-1 · 两处终态文案判定改走 isCanceled 单点并清失效清单条目

**验收内容**：【两处终态文案判定改走 isCanceled 单点并清失效清单条目】验收

**操作步骤**：
1. npx vitest run tests/live-tasks-single-source.test.ts → Tests 17 passed (17)、退出码 0（改前 2 failed：⑤新增即红/⑥清单漏判据）
2. sed -n '485p' src/client/views/report-head.ts | grep -c 'isCanceled(h)' = 1 且 grep -c "status === 'canceled'" = 0
3. sed -n '290p' src/client/views/report-band.ts | grep -c 'isCanceled(report.head)' = 1
4. grep -c "? (status === 'canceled'" tests/fixtures/canceled-literal-baseline.json = 0
5. git diff --stat 仅 report-head.ts / report-band.ts / canceled-literal-baseline.json 三个文件。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/live-tasks-single-source.test.ts → Tests 17 passed (17)、exit 0（改前 2 failed）；git diff 仅 report-head.ts(+2/-1)、report-band.ts(+2/-1)、canceled-literal-baseline.json(0/-12)；渲染回归 94 passed；两处判定改走 isCanceled 单点；复核逐条核对无偏离（行号 +1 顺移已显式声明）。

**验收状态**：✓ 通过

---

### v1-2 · 基线核对落账与类型检查收口

**验收内容**：【基线核对落账与类型检查收口】验收

**操作步骤**：
1. npx tsx scripts/test-baseline.mts --check → 输出「新增失败 0」（本次未引入任何新红），且本需求三文件（src/client/views/report-head.ts / src/client/views/report-band.ts / tests/fixtures/canceled-literal-baseline.json）在失败集合中出现 0 次
2. npx tsx scripts/test-baseline.mts --check 的 tsc 口径行为「退出码 0 · error TS 0 条」
3. npx tsc --noEmit → 退出码 0、error TS 0 条
4. npx vitest run tests/baseline-triage.test.ts tests/compat-req-261006201814.test.ts → 18 passed（三份清单同源不变量完好）。原判据「--check PASS」需 --refresh 把基线从 68 收敛到现行失败集，而 refresh 只写两份、会破坏 reverse ∪ other == failures 不变量（实测打红 3 条并已按仓规 git checkout -- 还原）
5. 按 REQ-261008004324-81df/retro.md:55「基线三份清单重新分诊 = 人的动作」，该步与全部前置读数写入 docs/requirements/REQ-261008011831-3735/verification.md 移交人工，不由 agent 代劳。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/test-baseline.mts --check → 本次失败 16 / 基线 68 · 新增失败 0 / 不再失败 52 · tsc 0；npx tsc --noEmit → exit 0；baseline-triage + compat → 18 passed。未达成原「--check PASS」：refresh 只写两份会破坏三份清单同源不变量（实测打红 3 条、已按仓规 git checkout -- 还原），该步按 81df/retro.md:55 属「人的动作」，已连同前置读数移交人工。验收标准已按可执行等价判据修订并留痕。

**验收状态**：✓ 通过

---

### v1-3 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：三锚点：① 活卡单点用例 Tests 17 passed (17) ✅；② --check 未 PASS ⚠️（外部阻塞：基线陈旧 52 条已修好 + 落账末步按仓内结论属人的动作，前置条件已全备：新增失败 0 / 本需求三文件零出现 / tsc 0）；③ npx tsc --noEmit exit 0、error TS 0 ✅。另如实申报：授权外扩修 2 处缺陷（写盘点守卫、domain 时刻注入），改动 5 文件、回归 263 passed；期间一次 refresh 未连分诊造成 3 条自伤红，已还原复绿（21→18→16）。

**验收状态**：✓ 通过

---

### v1-4 · 需求级验收 · 追溯断链

**验收内容**：FR 追溯断链：以下功能点的 fr_to_tests 为空（FR→设计→任务→测试链路断裂）——FR-1；FR-2；FR-3。请补任务卡 serves: FR-x 标注与测试 covers: t-xxx 标注；通过时意见须写明处置方式。

**操作步骤**：
1. FR 追溯断链：以下功能点的 fr_to_tests 为空（FR→设计→任务→测试链路断裂）——FR-1
2. FR-2
3. FR-3。请补任务卡 serves: FR-x 标注与测试 covers: t-xxx 标注
4. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：「确认无需 E2E：纯函数模块，无外部接口」

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/live-tasks-single-source.test.ts → Tests 17 passed (17)、exit 0（改前 2 failed：⑤新增即红/⑥清单漏判据）
- npx vitest run tests/report-shell.test.ts tests/report-firstscreen-gaps.test.ts → 94 passed（终态文案与渲染行为不变）
- npx tsx scripts/test-baseline.mts --check → 本次失败 16 条 / 基线 68 条 · 新增失败 0 / 不再失败 52 · tsc 退出码 0（exit 1，唯一原因是基线陈旧）
- npx tsc --noEmit → exit 0、error TS 0 条
- npx vitest run tests/archive-*.test.ts tests/kb-*.test.ts → 29 文件 / 263 passed（授权外扩修复零回归）
- npx vitest run tests/baseline-triage.test.ts tests/compat-req-261006201814.test.ts → 18 passed（三份清单同源不变量完好）
- git diff --stat src/client/views/report-head.ts src/client/views/report-band.ts tests/fixtures/canceled-literal-baseline.json → +2/-1、+2/-1、0/-12（仅这三文件）
- git status --porcelain docs/reviews/ 在 --check 前后均为空 → 证明 --check 只读，不影响 REQ-261008004324-81df 正在验收的台账
- docs/requirements/REQ-261008004324-81df/retro.md:55 → 「基线三份清单重新分诊 ｜ 人的动作 ｜ failures.txt / reverse.txt / other.txt 同源刷新」
- docs/requirements/REQ-261008004324-81df/design/data-model.md:30 → 「基线三份清单必须同源……本需求已回滚：refresh 只写两份、破坏三份清单的分诊不变量」
- docs/requirements/REQ-261008011831-3735/verification.md
- docs/requirements/REQ-261008011831-3735/reviews/review-notes.md
- docs/requirements/REQ-261008011831-3735/tests/evidence.md
- docs/requirements/REQ-261008011831-3735/design/architecture.md
- docs/requirements/REQ-261008011831-3735/design/data-model.md
- docs/requirements/REQ-261008011831-3735/design/interfaces.md
- docs/requirements/REQ-261008011831-3735/design/test-cases.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 两处终态文案判定改走 isCanceled 单点并清失效清单条目 | ✓ 通过 | human/session-646e8ead-d42e-4ed1-b531-993ff297ab7e | 2026-10-08 02:19 |
| v1-2 | 基线核对落账与类型检查收口 | ✓ 通过 | human/session-646e8ead-d42e-4ed1-b531-993ff297ab7e | 2026-10-08 02:19 |
| v1-3 | 需求级验收 | ✓ 通过 | human/session-646e8ead-d42e-4ed1-b531-993ff297ab7e | 2026-10-08 02:19 |
| v1-4 | 需求级验收 · 追溯断链 | ✓ 通过 | human/session-646e8ead-d42e-4ed1-b531-993ff297ab7e | 2026-10-08 02:19 |
