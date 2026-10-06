# t-fcdf91 新增对比度报表脚本（读 report.ts 令牌声明）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
新增对比度报表脚本（读 report.ts 令牌声明）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
① `npx tsx scripts/req-detail-ui-contrast.mts` 退出码 0，输出含每个色值的实测比值与判定（正文档 ≥ 4.5、非文本档 ≥ 3）；② 可失败性自证：临时把 --pm-warn-text 改回 #a86a00 后退出码非 0，恢复后复绿；③ `grep -c -e '--pm-ok-text-tint' -e '--pm-teal-text-tint' -e '--pm-danger-text' src/client/styles/report.ts` ≥ 3；④ `grep -c 'data-ds-dark-theme' src/client/styles/report.ts` = 0，且脚本里有「报表出现宿主深色影响即判失败」的分支；⑤ 报表落 docs/requirements/REQ-261005155003-f32f/evidence/，并与 evidence/contrast-baseline.txt 的豁免登记逐条对齐。

## 实施方案（implementation）
新增 scripts/req-detail-ui-contrast.mts：从 src/client/styles/report.ts 的令牌声明解析色值（不复制一份值），按 WCAG 相对亮度公式打印「用途 / 色值 / 背景 / 实测比值 / 判定」全表；覆盖三类关系——① 深字压白底（text 16.9、text2 5.07、ok 5.14、teal 4.89、danger 5.38、warn 5.28、accent 4.70）；② 组合背景（12% 同色浅底 + 文字：若某处仍留底色块则启用 --pm-ok-text-tint 4.55 / --pm-teal-text-tint 4.52 / --pm-danger-text 4.52 并重测）；③ 反白关系（白字压 --pm-accent 主按钮底 4.70）；非文本档 ≥ 3:1（图标、进度条完成与当前段、状态带左边色条、焦点环、缺口严重度标记）；豁免逐条登记并给理由（--pm-line 1.25、--pm-line-strong 1.45、未开始阶段段 1.24）；报表里出现 [data-ds-dark-theme] 对详情页的任何影响即判失败；退出码 0/1/2 语义与既有探针一致。基线全表见 evidence/contrast-baseline.txt。

## 上游产出摘要（dependsSummary）
- 落地浅色岛令牌块并移除宿主深色覆盖

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T14:25:32.996Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

父卡收尾：对比度报表脚本交付并自证可失败

### 完成项

- 新增 scripts/req-detail-ui-contrast.mts：读 report.ts 令牌声明、按 WCAG 公式算全表
- 覆盖三类关系：正字压白底 / 组合背景（旧芯片浅底）/ 反白（白字压主色）
- 豁免逐条登记（发丝线、更强分隔、未开始段、halo），并判浅色岛口径（宿主令牌 0 引用）
- 可失败性自证通过：临时改回 #a86a00 即退出码 1
- 报表落 evidence/contrast-report.txt；三张子卡全部 done

### 改动文件

- `scripts/req-detail-ui-contrast.mts`
- `docs/requirements/REQ-261005155003-f32f/evidence/contrast-report.txt`

### 下一步

下一张：t-bce26d 同步既有渲染断言

---
