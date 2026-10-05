# t-ed2cec 批内写集分组真并行·复核

> 需求：REQ-261003222428-3556 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

## 在做什么
批内写集分组真并行·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-03T16:00:34.781Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

复核通过：FR-2 七点设计全符；一处声明——跨卡防线「不动」在真并行下不可行，改为 myWindow 排除且串行语义零变化（用例证成）；行为不变式四条成立

### 完成项

- 对照 design/architecture.md「FR-2 · 批内真并行」逐条核对：写集移植 ✓ 快事件串行先行 ✓ RUN_SUBTASK 分组并行 ✓ 未声明保守串行 ✓ Promise.all 组内 ✓ batchId 留痕 ✓ 失败暂停语义 ✓——七点全符
- 偏离声明（一处，必要）：设计风险节写「detectCrossCardOverwrite 运行期防线不动」——实施发现真并行下该防线必然误伤（我的落盘 mtime 落在并行对方窗口），不改则并行永远被它挡死；改为 myWindow 排除（严格大于边界），串行判定逐字保留（既有用例零改动转绿）
- 行为不变式核验：① selectAdvanceBatch 零改动 ② 未声明写集=串行（用例③证）③ 停止原因/回执形状不变 ④ 凭证门判据不变——四条成立
- 复跑：advance-parallel 4 + advance-chain 11 + concurrency-limits 7 + 其余 advance 一族 = 44 全绿

### 改动文件

- `docs/requirements/REQ-261003222428-3556/tasks/t-ed2cec.md`

### 下一步

测试段（t-58eede）：父卡终态验收命令+全量基线

---
