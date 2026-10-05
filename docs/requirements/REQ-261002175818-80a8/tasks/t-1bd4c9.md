# t-1bd4c9 体量声明进台账、活到任务卡上（防静默丢弃）·测试

> 需求：REQ-261002175818-80a8 拆分阶段预判单轮余量：卡片体量声明与超容量强制分批

## 在做什么
体量声明进台账、活到任务卡上（防静默丢弃）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-04T04:50:20.799Z，窗口 session-5c6b1a8b-3234-4f35-b28f-1f1a20834721）

测试这一关给出的是**可对照的基线数**，不是"跑过了"：全量 97 failed / 3811 passed，失败数与 t1 收尾时一模一样（都 ≤ 基线 106），也就是说这两张卡**没有引入任何一条新失败**；本卡自己的 7 条用例全绿，其中 3 条是复核挑出来的盲区补的，而且每条都被变异证明"删掉实现就会红"。

### 完成项

- 本卡用例：tests/plan-footprint-propagation.test.ts 7/7 全绿（含复核补的三条：看板批准直接落库、legacy 计划创作型、计划权威语义）
- 全量回归：97 failed / 3811 passed / 20 skipped（3928）；失败数 ≤ 开工前基线 106
- 通过数较 t1 收尾时 3794 增 17 条（本卡新增 4 条用例 + 其他窗口的并发改动）
- npx tsc --noEmit：145 条 ≤ 基线 223；本卡触及的四个源文件 0 条
- layer-boundary：本卡触及文件（protocol.ts / plan-landing / approved-plan-landing / Decompose.ts）在违规清单命中 0
- size-budget：本卡触及文件命中 0
- 夹具垃圾已清：docs/requirements/ 下无 REQ-fp0001 / REQ-abc123 残留
- 变异测试留档：M1/M4/M5 原本覆盖；M2（draftOf）与 M3（创作型映射）经补洞后也已证明会红；M6（落库写死常量）2/3 条变红
- 如实上报复核列出的越界项：SubmitTool 入参 schema 缺 footprint（P0，属 t3 的验收线）、draftOf 丢 template（真缺陷，与「两条通道落出同样结果」的自述矛盾）、applyReworkUpdate / planRollbackTasks / HTTP 建卡改卡 / 子卡继承 四处旁路语义未定

### 改动文件

- `tests/plan-footprint-propagation.test.ts`

### 下一步

父卡收尾：四张子卡（研发/联调/复核/测试）均已 done，推进 t-ab73f4 到 done；随后链上 t3（工具门面，含复核指出的 P0 入参 schema）与 t4（余量端口）可并行开工。

---
