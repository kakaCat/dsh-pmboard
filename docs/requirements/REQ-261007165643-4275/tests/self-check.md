测试证据（REQ-261007165643-4275 · spike 只读调研）
=====================================================
判据对象：文档与读数（无生产代码改动，vitest 不适用，理由见 design/test-cases.md）

覆盖映射（本证据文件覆盖全部任务卡；各卡判据均为下列 TC 读数）：
covers: t-ab3e06
covers: t-535c52
covers: t-8d3e55
covers: t-552e68
covers: t-02e50f
covers: t-9d7b6f

- t-ab3e06 / t-8d3e55（定稿·研发）→ TC-1~TC-4、TC-6（口径读数 + 自检 + 占位符扫描）
- t-552e68（定稿·复核）→ TC-5（引用抽检，详见 reviews/review-2026-10-07.md）
- t-535c52 / t-02e50f（提交验收·研发）→ TC-4（自检 exit 0 = 材料齐备判据）
- t-9d7b6f（提交验收·复核）→ TC-4 + TC-5（齐备性核对与读数一致性）

[TC-1] 注册工具数
$ grep -c "toolName: 'reqboard_" src/tools/registry.ts
27

[TC-2] 错误码读数
$ grep -rho "REQBOARD_[A-Z_]*" src --include=*.ts | sort -u | wc -l
139
$ grep -rho "REQBOARD_[A-Z_]*" src --include=*.ts | grep -c XXX
2
注：139 含占位 REQBOARD_XXX（2 处示例）与模板裸前缀 REQBOARD_（13 处 REQBOARD_${…}）；
剔除后 ≈136~138，与报告 3.2 的 136 在验收允许 ±2 口径差内。

[TC-3] prompt 字符数
$ wc -m src/tools/*/prompt.ts | sort -rn | head -3
14835 total
2608 src/tools/SubmitTool/prompt.ts
1277 src/tools/AskConfirmTool/prompt.ts

[TC-4] 文档自检
$ npx tsx scripts/req-doc-validate.mts --req REQ-261007165643-4275 --category spike
文档自检汇总：判据 9 项（实判 6 / 读数未知 3）；缺口 0；exit 0

[TC-5] 引用抽检（两轮，11 处）→ 见 reviews/review-2026-10-07.md 抽检记录表：全部属实

[TC-6] 占位符扫描
$ grep -c "待回填\|（待" docs/requirements/REQ-261007165643-4275/design/research-report.md
0
