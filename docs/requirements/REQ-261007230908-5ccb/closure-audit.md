# 体检收官对照表（REQ-261007165643-4275 §4.3 十项治理建议）

> REQ-261007230908-5ccb FR-5 · 生成于 2026-10-07。
> 对照对象：`docs/requirements/REQ-261007165643-4275/design/research-report.md` §4.3（G1~G10）。
> 口径：逐行给「去向」（已落地的 REQ 编号 / 本批 FR 编号 / 不做的理由）与「核验」（命令或文档路径）。
> 体检报告本身已归档，**不回写原文**——本表是它的收官伴生件。

| G 编号 | 建议摘要 | 去向 | 核验 |
|--------|---------|------|------|
| G1 | 修 7 处死路径引用 + 加「文案引用的仓内路径必须存在」机械检查 | 已落地：REQ-261007200706-89b7（第二批，状态 accepting 待验收） | `docs/requirements/REQ-261007200706-89b7/requirement.md` FR-1；该批交付含 `scripts/prompt-path-probe.mts` 路径存在性探针 |
| G2 | 立项问数统一口径（不数问数 / 以 CAPTURE_QUESTION_IDS 为唯一事实源）+ 补 doc_location | 已落地：REQ-261007200706-89b7 FR-2 | 同上 requirement.md FR-2 判据 |
| G3 | submit prompt 修「五类→六类」、补 prototype 支、细则下沉拒绝回执 | 已落地：REQ-261007200706-89b7 FR-3 | 同上 requirement.md FR-3 判据 |
| G4 | 建 REQBOARD_* 大写码注册表 + 扫描门禁，让 prompt 错误码清单可被 CI 校验 | **本批（FR-1 / FR-2 / FR-3）** | `npx vitest run tests/error-code-registry.test.ts tests/prompt-error-codes.test.ts`；注册表 `src/shared/error-code-registry.ts`（133 条） |
| G5 | 错误码 prompt 清单补全（OpenWindow/SkillInstall/Create/RunStatus 漏码）或改定性表述 | **本批（FR-3 / FR-5）**：按 D-4 选「补全」，四工具逐格对齐实现所抛 | `src/tools/{OpenWindowTool,SkillInstallTool,CreateTool,StatusTool}/prompt.ts`；比对命令见下「G5 逐格核对」 |
| G6 | 删 agent 可见字符串中的 REQ/FR 编号引用、RunStatusTool 描述删修复史 | 已落地：REQ-261007200706-89b7 FR-4 | 同上 requirement.md FR-4 判据 |
| G7 | LONG_TEXT_ARG_NOTE 从一次性副作用工具撤下 | 已落地：REQ-261007200706-89b7 FR-5 | 同上 requirement.md FR-5 判据 |
| G8 | ask_confirm 拦截清单改「全部写路径」+ 补 budget CAS 参数描述 | 已落地：REQ-261007200706-89b7 FR-6 | 同上 requirement.md FR-6 判据 |
| G9 | cordis.patch.yml 注释计数 / package.json repository.directory 残留清理 | 已落地：REQ-261007200706-89b7 FR-7 | 同上 requirement.md FR-7 判据 |
| G10 | 双字段双拼归一逻辑单源化（protocol.ts 与 plan-granularity.ts 两处 → 一处） | **本批（FR-4）**：抽 `src/shared/dual-field.ts`，4 处读取点改调用 | `npx vitest run tests/dual-field.test.ts`；`grep -rn "o\.granularity_exempt ?? o\.granularityExempt" src` 命中 0 |

## 十项之外：§4.1 工具面精简的去向

§4.3 只列十项治理建议，而体检报告另有 §4.1「工具面 27 → 21」——由第三批承接，一并记在此处，
避免「报告读完还有没去向的建议」：

| 建议 | 去向 | 核验 |
|------|------|------|
| §4.1 工具面精简（S1~S6：删弃用别名/合并查询面/修缮簇三合一等） | 已落地：REQ-261007220012-bd29（第三批，状态 archived） | `docs/requirements/REQ-261007220012-bd29/requirement.md` FR-1~FR-7；registry 21 条 |

## G5 逐格核对（prompt 列码 = 实现所抛）

```bash
# 逐工具比对（两边 sort -u 应完全一致）
for t in OpenWindowTool SkillInstallTool CreateTool StatusTool; do
  diff <(grep -o 'REQBOARD_[A-Z0-9_]*' src/tools/$t/prompt.ts | sort -u) \
       <(grep -rho 'REQBOARD_[A-Z0-9_]*' src/tools/$t/ --include='*.ts' | sort -u)
done
```

2026-10-07 实测：四工具 diff 均为空（含包装码 REQBOARD_SKILLS_INSTALL_FAILED、
通用门 REQBOARD_NOT_BOUND_TO_WINDOW）。

## 收官结论

- §4.3 十项 G **全部有去向**：七项由第二批（REQ-261007200706-89b7）承接、三项（G4/G5/G10）由本批承接；
- 十项之外，§4.1 工具面精简由第三批（REQ-261007220012-bd29）承接；
- 唯一待办是**人的动作**：第二批 REQ-261007200706-89b7 仍在 accepting（待验收）——
  其验收完成即体检报告全链条闭环，本表届时无需改动（去向指向的是需求编号，不是状态）。

## 边界声明

- 本表**不是**验收凭证，也不替代各 REQ 自己的验收单；它是「报告建议 → 承接需求」的索引；
- 体检报告（REQ-261007165643-4275）已归档，本表不回写其原文（归档文档不作二次编辑）。
