# t-db1c64 超容量看得见（一）：提交时说清哪张卡装不下·测试

> 需求：REQ-261002175818-80a8 拆分阶段预判单轮余量：卡片体量声明与超容量强制分批

## 在做什么
超容量看得见（一）：提交时说清哪张卡装不下·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-04T05:10:35.792Z，窗口 session-5c6b1a8b-3234-4f35-b28f-1f1a20834721）

测试这一关的数字：**失败数从 t1 到现在一条都没变（97），通过数 +26**。也就是说这五张卡**没有惊动任何既有行为**，而需求的能力是净增的。另有一条变异留档：把我补的路径参数拿掉，用例立刻红——说明那条修复不是摆设。

### 完成项

- 本卡用例：tests/plan-footprint.test.ts + tests/plan-overcapacity-notice.test.ts = 18/18 全绿（含我补的 2 条非默认路径用例）
- 全量回归：97 failed / 3850 passed / 20 skipped（3967）——**失败数与 t1 收尾时逐条相同**（t1→t5 全程零新增失败）
- 通过数 +26（本卡 +18；余 8 条来自其他窗口的并发改动）
- npx tsc --noEmit：145 条，与基线持平；本卡文件 0 错
- output-contract 的 defineSubmitTool 静态扫描通过（marker_warnings 已声明）
- 回归 A/B 证伪（子代理执行，我核对）：临时关掉新门禁后，decompose-tools / doc-sync / t17 / design-registration / plan-mode 的 11 条失败集合逐条相同 → 与本卡无关
- size-budget：既有超标清单未新增成员（SubmitArtifact.ts 394 ≤ 400）
- 变异留档：去掉计划路径参数 → 非默认路径用例红（说明该修复是活的）

### 改动文件

- `tests/plan-footprint.test.ts`
- `tests/plan-overcapacity-notice.test.ts`

### 下一步

父卡收尾：四张子卡均已 done，补父卡完工记录后推进 t-2c4300 到 done。

---
