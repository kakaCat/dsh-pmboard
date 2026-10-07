# t-2c0e9a 覆盖层按组件归位（拆 :is() 组并补回特异性）·测试

> 需求：REQ-261007133149-0716 详情页组件化改造：单文件单组件 + 契约显式化（面向 agent 可维护性）

## 在做什么
覆盖层按组件归位（拆 :is() 组并补回特异性）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-07T09:40:05.614Z，窗口 session-45c3638c-3cf2-4082-9e19-82253fec80eb）

测试段：三条验收全绿（快照 0 差异 / 门禁 0 处 0 处 / 探针 4/4 + A13），另加反向验证、构建回归、散文泄漏与无损账目五项自检。

### 完成项

- ① npx tsx scripts/report-style-snapshot.mts --check → 退出码 0，PASS：28 个采样条件、10 个组件逐组件不同键数全 0（外观零变更）
- ② npx tsx scripts/report-style-ownership.mts → 退出码 0，组件越界 0 处 / 公共层含具体组件取值 0 处 / 未登记 0 处；DOM 根并集 10；清单完整性 351 类名全认领
- ③ npx tsx scripts/req-report-probe.mts → 退出码 0，PROBE PASS：4/4 组合 + A13 六面板全过
- 门禁自带反向验证 --self-test → 退出码 0：R-1（verify 选择器写进 docs 分片）/ R-2（组件规则写进 shared）必红且点名，R-3 反例不红
- 回归 pnpm typecheck → 退出码 0；pnpm build:client → 退出码 0（bundle=766888 bytes、样式归属章在场、CSS 分片完整）
- 散文泄漏与注释配平自检 → 去注释后 0 处散文漏成选择器、0 个孤立注释符
- 无损账目 → 旧基线 221 条选择器逐条可查（3 条可解释例外）；13 片规则数 634 = 归位前 631 + 拆组 3

### 改动文件

- `docs/requirements/REQ-261007133149-0716/evidence/ownership-baseline.json`

### 下一步

父卡 t-d2d7d2 收尾；下一步接 t6（门禁反向验证 R-1~R-5 + 维护指南与领域篇更新）。

---
