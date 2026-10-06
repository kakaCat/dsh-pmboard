# 测试用例设计（REQ-261006123819-3af3）· serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

> 每条 TC 给：目标命令 / 期望观察 / 反向证伪（人为改坏必红）。**验收标准必须可执行**——
> 空话验收会被打回（C-08）。

## 功能测试用例 <!-- serves: FR-1, FR-2, FR-3 -->

| TC | 覆盖 FR | 目标命令 | 期望观察 |
|---|---|---|---|
| TC-1 | FR-1 | `npx vitest run tests/output-contract.test.ts` | `Test Files 1 passed`；4 个原缺失映射的用例由红转绿 |
| TC-2 | FR-1 | `npx vitest run tests/tools-dispatch.test.ts tests/apply-wiring.test.ts` | 两文件全绿（目录 27、注册名 27，与 registry 一致） |
| TC-3 | FR-1 | `comm -23 <(扫描工厂) <(registry.key)` | 差集为空（I-3） |
| TC-4 | FR-1 | `grep -n 'define(\w+)Tool\\(deps: UseCaseDeps' tests/output-contract.test.ts` | 正则已放宽（容许第二参数） |
| TC-5 | FR-3 | 门禁探针：读真实台账记录调 `buildGateVerdicts` | `status=archived` 的记录 → `verdict: 'passed'`；`at` 等于该记录 `statusHistory` 里 archived 事件的 `at` |
| TC-6 | FR-3 | `grep -rn "archivedAt\|archivedBy" src/ tests/ scripts/` | 无输出（生产与测试都清干净） |
| TC-7 | FR-3 | `npx vitest run tests/query-report.test.ts tests/docs-panel.test.ts tests/node-panel.test.ts tests/client-view.test.ts tests/stage-detail.test.ts tests/acceptance-criteria.test.ts` | 全绿；且其中**至少一条用例走真实归档状态**而非夹具构造 `archivedAt` |
| TC-8 | FR-3 | 反向：造一条 `status=archived` 但 `statusHistory` 无 archived 事件的记录 | 门禁 `passed` 且**回执不含 `at` 键**（不是 `at: undefined`、不是 `at: null`） |
| TC-9 | FR-3 | 反向：`archive.submittedAt` 有值但 `status≠archived` | 门禁 `pending`，`at = archive.submittedAt`（不得判 passed） |
| TC-10 | FR-2 | `pnpm baseline:check` | exit 0；输出含工作树指纹；差集两栏计数均为 0 |
| TC-11 | FR-2 | 反向：临时把一条已通过用例改成必失败 → `pnpm baseline:check` | exit 1；「新增失败」栏点名该用例；还原后复绿 |
| TC-12 | FR-2 | `grep -rn "≤ 98\|≤98\|≤ 197\|≤197\|基线 106\|当前 223" docs/knowledge/ docs/guides/ docs/architecture/` | 无输出（规范性面清零） |
| TC-13 | FR-2 | `grep -n "baseline" docs/knowledge/conventions.md` | C-14/C-15 内含指向 `docs/reviews/test-baseline.md` 的指针，不再含绝对数字 |
| TC-14 | FR-4 | `npx tsx scripts/kb-probe.mts` | `0 项失败`；`REAL_EXIT=0` |
| TC-15 | FR-4 | `pnpm kb:check` | exit 0；无 `[drift]` 行 |
| TC-16 | FR-4 | `grep -c 'kb-conventions-c-22' docs/knowledge/INDEX.md`；`grep -c 'kb-0043\|kb-0048' docs/knowledge/INDEX.md` | 依次 `1`、`2` |
| TC-17 | FR-4 | 反向：临时给 `INDEX.md` 加一行超长 `one_liner` → `kb-probe` | K6 变红并点名；还原后复绿 |
| TC-18 | FR-6 | `pnpm baseline:refresh` 的输出 | 含 `HEAD` 短哈希与 `git diff --stat` 摘要；基线文件写入同样字段 |
| TC-19 | FR-6 | `grep -rn "工作树指纹" docs/requirement* docs/reviews/ templates/ 2>/dev/null` | 验收材料与模板/检查单里都能 grep 到该要求 |
| TC-20 | FR-5 | `git log --oneline --grep=REQ-261006123819-3af3 \| wc -l` | ≥1 |
| TC-21 | FR-5 | `git show --stat <本需求提交>` | 文件集合 ⊆ 本需求改动清单；不含其他需求目录 |

### 反向证伪（本仓惯例：门禁必须"人为改坏必红"） <!-- serves: FR-1,FR-2,FR-3 -->

| 反向用例 | 怎么做 | 必须观察到 |
|---|---|---|
| RV-1（FR-1） | 从 `TOOL_REGISTRY` 删掉 `TaskAdopt` 一条 | TC-1 与 TC-3 同时红，且点名 `TaskAdopt` |
| RV-2（FR-1） | 把某条的 `responseSources` 改成不存在的路径 | 该条用例红（`readFileSync` 失败），不静默跳过 |
| RV-3（FR-3） | 把 `archivedMomentOf` 改成返回 `undefined` | TC-8 通过（省略键）但 TC-5 红（`at` 缺失）——两条必须**分别**成立 |
| RV-4（FR-3） | 把门禁改回 `a?.archivedAt !== undefined` | TC-5 红（回到 `pending`） |
| RV-5（FR-2） | 删掉基线 txt 文件 | `pnpm baseline:check` exit 1 并报"没有基线"，**不得当作通过** |
| RV-6（FR-4） | 从 `INDEX.md` 删掉 kb-0043 行 | `kb-probe` K5 红并点名 |

## 测试覆盖度统计 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

| FR | 直接 TC | 反向 RV | 判据形态 |
|---|---|---|---|
| FR-1 | TC-1～TC-4 | RV-1, RV-2 | 3 个测试文件全绿 + 差集为空 |
| FR-2 | TC-10～TC-13 | RV-5 | 脚本 exit 码 + scoped grep |
| FR-3 | TC-5～TC-9 | RV-3, RV-4 | 门禁读数 + 真实数据探针 |
| FR-4 | TC-14～TC-17 | RV-6 | 自检 0 项失败 |
| FR-5 | TC-20, TC-21 | — | git 历史可查 |
| FR-6 | TC-18, TC-19 | — | 输出/文档含指纹字段 |

**端到端一条命令（父卡验收命令，建议）**：

```bash
npx vitest run tests/output-contract.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts \
  tests/query-report.test.ts tests/docs-panel.test.ts tests/node-panel.test.ts tests/client-view.test.ts \
  && pnpm baseline:check && npx tsx scripts/kb-probe.mts
```

## 关键决策与取舍 <!-- serves: FR-3 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| FR-3 的回归面 | 只跑 `query-report.test.ts` | 6 个既有测试文件全跑 + 至少一条走真实状态 | 现有 6 个文件都用夹具构造 `archivedAt`；不换掉至少一条，就等于"改完仍无覆盖" |
| 门禁探针怎么建 | 用合成 record 单测 | **读真实台账记录**调 `buildGateVerdicts` | 合成 record 只能证明代码逻辑，证明不了"87 条真实记录都判对" |
| 反向用例粒度 | 合并成一条"全部改坏" | 逐条独立（RV-1～RV-6） | 合并后无法定位是哪道门失效；本仓惯例是逐门独立逆验证 |

## 技术方案与亮点 <!-- serves: FR-2, FR-3 -->

- **测试自己也是"判据"**：TC-9 与 TC-8 把「材料已备但未归档」与「已归档但取不到时刻」两种
  边界分别锁住——这正是改动前混淆在一起、导致页面说谎的那两种情形。
- **真实数据探针进验收**：FR-3 的 TC-5 用真实台账记录当输入，避免"夹具全绿、真实数据照错"。
- **RV-5 把"缺基线"变成红**：防止未来有人删掉基线文件后所有检查静默通过。
