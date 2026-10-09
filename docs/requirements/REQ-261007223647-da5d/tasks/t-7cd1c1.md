# t-7cd1c1 立项弹框四问内容定稿·联调

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
立项弹框四问内容定稿·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/capture-tool.test.ts` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T15:57:38.447Z，窗口 session-3a744c5e-7560-408e-8db1-5f27fecc8150）

联调阶段确认本卡是纯函数契约，无运行时接口面，以同批契约测试作为联调替代证据。

### 完成项

- 清点本卡接口面：buildCaptureIntentQuestions / buildCaptureDetailQuestions / mapCaptureAnswers 均为纯函数，无运行时接口、无跨进程调用
- 同批契约验证已覆盖：9 个测试文件 111 项通过，覆盖题目构造、映射拆分、回执 schema 三面
- 无接口可联调——如实记录（本卡计划期未声明 skipIntegration，属链模板默认展开）

### 改动文件

- `src/application/internal/capture-mapping.ts`

### 下一步

复核子卡：对照卡内验收标准自查

---
