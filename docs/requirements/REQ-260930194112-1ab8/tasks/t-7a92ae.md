# t-7a92ae 五档宽度布局回归探针（headless Chrome）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
五档宽度布局回归探针（headless Chrome）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
跑 npx tsx scripts/list-responsive-probe.mts → 退出码 0，stdout 包含 5 行 DIAG 且均为 problems=NONE、末行包含 PROBE PASS；断言 640 档 overflowX=true、1680 档 cols=8 且 titleW≥500；负向验证：把 src/client/styles/board.ts 里的 min-width: 720px 临时改为 2000px 后重跑，stdout 必须包含 PROBE FAIL 且退出码非 0。

## 实施方案（implementation）
新增 scripts/list-responsive-probe.mts：内建 4 条 fixture（长 ID / 长标题 / 中英混排）渲染标本页并拼接真实 CSS，注入断言脚本（关键列行盒数、按钮包围盒相交、操作列是否被压缩、可见列数、横向溢出），按 640/760/840/1080/1680 调 headless Chrome --dump-dom 读回 #diag；CHROME_BIN 优先、macOS 默认路径兜底，找不到 Chrome 退出码 2 并打印原因；末行 PROBE PASS/FAIL。

## 上游产出摘要（dependsSummary）
- 列表视图自适应样式与两档让位断点

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-09-30T14:22:09.891Z，窗口 session-c1999330-7372-45da-b999-171621fa17bb）

这一步做完，「列表在窄屏会不会塌陷」这件事从**靠人肉眼发现**变成**一条命令判定**：五档宽度一次跑完，通过就退出 0，出问题就点名是哪一档、哪条症状，并且返回失败码能被 CI/门禁接住。

### 完成项

- 新增 scripts/list-responsive-probe.mts：五档宽度真实渲染断言（A1~A6），退出码 0/1/2 语义
- 正向实测：5 行 DIAG 全 problems=NONE，数值与设计基线表一致（640 cols4 overflowX=true；1680 cols8 titleW=540）
- 负向验证：把保底宽度改坏后 PROBE FAIL + 退出码 1，探针确实会红
- 归属到本卡的三张子卡（研发/复核/测试）全部完成

### 改动文件

- `scripts/list-responsive-probe.mts`

### 下一步

t4：采集最终对照截图、核对改动面与回滚面

---
