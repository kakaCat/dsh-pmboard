# t-9d4bad 提交侧：results 参数 + 逐项交代硬门 + 落结果·研发

> 需求：REQ-261006092213-4f5b 验收项由 agent 实测完成：人只做审核员

## 在做什么
提交侧：results 参数 + 逐项交代硬门 + 落结果·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T02:07:31.452Z，窗口 session-851897de-d884-4ab8-b689-160d66853eb4）

逐项实测结果接入提交侧：results 参数 + 逐项交代硬门 + 组装后落章

### 完成项

- SubmitTool 顶层声明 results，元素含 ref/result/needsHuman/humanReason
- 返回体新增 results_bound/matched/unmatched/out_of_scope/coverage 并同步 output schema
- SubmitVerification 把验收单组装排到硬门之前，预览单与落库单是同一份
- 硬门六族映射四个新错误码：漏项/坏 ref/重复/空结果拒绝并点名到 ref
- 拒绝全部发生在 mutate 之前，台账 revision 不变（用例断言）
- 落章时写 result 与 resultSource=agent；needsHuman 必须带理由
- knownKeys 四类配方，对照项键按本轮产出条件化
- 老写法不带 results 仍成功，results_coverage=legacy
- accept-sheet-tool 用例 25 项全绿（新增 8 项）；typecheck 退出码 0
- 全量失败 68 项，低于基线 106，且与本卡改动无因果

### 改动文件

- `src/tools/SubmitTool/SubmitTool.ts`
- `src/tools/SubmitTool/prompt.ts`
- `src/application/use-cases/SubmitVerification.ts`
- `tests/accept-sheet-tool.test.ts`

### 下一步

联调子卡：核对工具参数与返回体形状在同一次真实调用里闭合

---
