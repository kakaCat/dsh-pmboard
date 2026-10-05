# t-415fbf 接口契约：reqboard_move 回执与 schema 声明·研发

> 需求：REQ-261003204149-1e80 reqboard_move 回退功能：补齐撤销语义与旧任务卡处置

## 在做什么
接口契约：reqboard_move 回执与 schema 声明·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T13:06:31.352Z，窗口 session-a3e5e82b-b588-4c77-b458-9c2065eb0e87）

研发段做完：回退回执的四个字段先被写进工具契约里——口径与本仓当天两次「值算出来了、调用方只看到报错」的事故正好相反，这次先把声明补齐再让实现返回。

### 完成项

- MoveTool 的 output.schema 新增 rollback 对象，含 additionalProperties:false 与四个子键逐字声明
- 注释写明为何显式声明到叶子：当天两处同类漂移（capture 的 answers.workspace、submit 的 auto_confirm）都是嵌套对象漏声明
- 前进方向整体省略该键（不是发 null／undefined），已在注释中定死
- 验收命令：tools-schema 与 output-contract 失败数与改动前一致（3 例红为既有缺失映射，与本次无关）；声明四个子键均可 grep 到

### 改动文件

- `src/tools/MoveTool/MoveTool.ts`

### 下一步

联调段：核对 output-contract 静态扫描对新增声明的处理

---
