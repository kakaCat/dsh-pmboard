# t-4dc5f3 判据实测定标并把读数回写条目与用例表·测试

> 需求：REQ-261006115829-dafb 排查 dsh-app://app/plugins/events 的 404/ERR_FAILED（重建重启竞态）

## 在做什么
判据实测定标并把读数回写条目与用例表·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T04:14:48.665Z，窗口 session-c9490164-89ba-491f-90ba-824aa5002549）

测试段结论：TC-1/TC-2/TC-3 全过、tsc 零错误；TC-4 交付面可判、整树口径不可判；全量测试与知识层自检均受并行会话 src 改动影响，按不可判如实上报（不静默判过）。

### 完成项

- TC-1 通过：五段各 1、66 行 ≤120、text/event-stream 命中 1、禁用语 0
- TC-2 通过：docs/ 下入链 2 条分别落在 project-manual.md 与 plugin-runtime-prerequisites.md（另有需求文档自身的引用）
- TC-3 通过：C-1 = 200 + text/event-stream；C-2 = 200（656260 字节）；C-3 = 404（0 字节）
- TC-4 部分可判：本卡自己的交付面（条目页 + 两处架构页 + TC-3 回写）全部落在 docs/；整树口径不可判（并行会话在写 src）
- 类型检查：npx tsc --noEmit 退出 0、零输出（无错误）
- 全量测试：70 failed / 5932 passed / 22 skipped（508 文件，39 失败）——未采集开工前基线，按不可判上报
- 失败归因证据：本卡零 src 改动；失败样例指向并行会话在飞的 src 改动（REQ-id 格式用例、failure-alert 弹框壳用例）
- 知识层自检：pnpm kb:check 退出 1，2 处漂移（code-map / design-tokens）——输入是 src 与客户端样式，本卡零 src 改动且两文件 mtime 11:05 早于本卡，按卡内条件不执行 kb:build，如实上报

### 下一步

父卡收尾（t-890bc5）；随后提交验收材料

---
