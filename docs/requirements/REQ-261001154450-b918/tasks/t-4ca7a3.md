# t-4ca7a3 节流拒绝文案可执行化·研发

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
节流拒绝文案可执行化·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/done-throttle-message.test.ts → 全绿；且对应源文件改动可在 git diff 中看到

## 汇报 1（2026-10-01T08:56:58.011Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

研发完成：被节流挡住时不再只看到"稍后再试"——回执给出「还需等待约 N 秒」、点名是哪张卡挡住的，并列出三条合规路径（等待 / 子卡链 / 交给自动链）。

### 完成项

- 研发完成：被节流挡住时不再只看到"稍后再试"——回执给出「还需等待约 N 秒」、点名是哪张卡挡住的，并列出三条合规路径（等待 / 子卡链 / 交给自动链）。

### 改动文件

- `src/domain/workflow/DoneEvidenceSpec.ts`
- `src/application/internal/support.ts`
- `tests/done-throttle-message.test.ts`
- `tests/domain/done-evidence.test.ts`

---
