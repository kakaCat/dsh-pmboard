# t-ede02b 新增对比度报表脚本（读 report.ts 令牌声明）·研发

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
新增对比度报表脚本（读 report.ts 令牌声明）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T14:25:05.574Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

研发段：对比度报表脚本交付，三类关系（正字/组合背景/反白）全覆盖

### 完成项

- 新增 scripts/req-detail-ui-contrast.mts：从 report.ts 的令牌声明解析色值，不复制一份值
- 三段判据表：A 真文字（含反白关系，9 条）/ B 非文本（8 条）/ D 芯片 tint 组合背景（3 条）
- C 段豁免逐条登记并给理由（发丝线 1.26 / 更强分隔 1.45 / 未开始段 1.09 / halo 装饰）
- E 段浅色岛口径：data-ds-dark-theme 命中数与 8 个宿主令牌引用数一并判红
- F 段 tint 备用令牌在场性；报表落到 evidence/contrast-report.txt
- 退出码 0/1/2 语义与既有探针一致；实测退出码 0

### 改动文件

- `scripts/req-detail-ui-contrast.mts`
- `docs/requirements/REQ-261005155003-f32f/evidence/contrast-report.txt`

### 下一步

复核段：可失败性自证与基线逐条对齐

---
