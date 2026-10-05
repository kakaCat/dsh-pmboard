# t-2bd99a 五档宽度布局回归探针（headless Chrome）·研发

> 需求：REQ-260930194112-1ab8 列表视图自适应修复：窄宽度下列被压缩换行、操作按钮重叠

## 在做什么
五档宽度布局回归探针（headless Chrome）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 `npx tsx scripts/list-responsive-probe.mts` → 退出码 0，stdout 含 5 行 DIAG 且均为 problems=NONE，末行含 PROBE PASS。

## 汇报 1（2026-09-30T14:19:12.824Z，窗口 session-c1999330-7372-45da-b999-171621fa17bb）

这一步做完，团队有了**能自动判「窄屏到底有没有塌陷」的检测器**：它用真实渲染量行盒与按钮位置，五档宽度一次跑完，人不用再手动缩放窗口去发现问题。

### 完成项

- 新增 scripts/list-responsive-probe.mts：真实 buildListView + 真实 CSS 拼标本页，注入 A1~A6 断言（行盒数 / 按钮相交 / 操作列压缩 / 可见列数 / 横向溢出 / 宽档不缩水）
- 五档宽度经 headless Chrome --dump-dom 读回 #diag：640/760/840/1080/1680 全部 problems=NONE
- 实测数值与设计基线表一致：640 cols=4 overflowX=true；840 cols=4；1080 cols=5；1680 cols=8 titleW=540
- 环境不可用分支：CHROME_BIN 优先 + macOS/Linux 常见路径兜底，找不到即退出码 2 并打印修复提示（不静默跳过）

### 改动文件

- `scripts/list-responsive-probe.mts`

### 下一步

复核子卡核对断言口径与档位期望是否与设计 T-1/A1~A6 一致；测试子卡做负向验证

---
