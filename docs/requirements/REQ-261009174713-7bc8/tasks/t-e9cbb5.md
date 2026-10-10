# t-e9cbb5 六类型规格快照测试·复核

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
六类型规格快照测试·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261009174713-7bc8/design/` 逐条核对；`npx vitest run tests/type-spec-snapshot.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-09T11:43:55.880Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

复核结论：无偏离。fixture 与 t1 基线逐字节相同；比较器对五个字段逐个注入漂移全部变红，无盲区；还原后复绿。

### 完成项

- 来源核对：cmp 证明 tests/fixtures/type-spec-baseline.json 与 .dsh-data/refactor-baseline/type-spec.json 逐字节相同
- 覆盖面无盲区（逐个字段实测）：requiredSections 与 requiredDesignDocs 与 conditionalStageArtifacts 与 archive 与 templates 各自注入漂移后门禁都变红
- 反向核对：还原 fixture 后门禁复绿（红不是环境噪声）
- 自检同源核对：非空转自检与正式断言共用同一个纯函数比较器，不存在「自检走另一条路」的假绿
- 复跑：npx vitest run tests/type-spec-snapshot.test.ts 5/5 绿；全量失败集与 t8 持平（新增失败 0）
- 口径说明：条件设计文档与中文标签不在 t1 基线覆盖内，已用 literal 钉住并在用例里写明，故不构成盲区

### 改动文件

- `.worktrees/req-261009174713-7bc8/tests/type-spec-snapshot.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/fixtures/type-spec-baseline.json`

### 下一步

交测试子卡 t-7a6e7f。

---
