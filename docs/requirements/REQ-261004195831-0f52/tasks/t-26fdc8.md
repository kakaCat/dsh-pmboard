# t-26fdc8 把详情视图接到 req-detail-store（四态分支 + 去重 + 草稿/Tab 回填）·研发

> 需求：REQ-261004195831-0f52 修复看板需求详情页打不开（/state 改摘要后详情未按需取全文）

## 在做什么
把详情视图接到 req-detail-store（四态分支 + 去重 + 草稿/Tab 回填）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T12:33:57.596Z，窗口 session-c7b8471e-ba16-48ff-ab19-61f88fa69a7e）

研发段完成：详情页真正接上了取数通道——打开即渲染全文，失败或需求没了都留在详情态给明确出路，不再静默弹回看板、也不再拿旧数据装作还在。

### 完成项

- board-mount case 'req'：摘要只喂骨架，正文由 reqDetailStore.ensure(reqId, summary.version, state.revision) 驱动四态渲染
- 删除「找不到记录就静默 mode=board」的回退（改为落「未找到」占位并留在详情态）
- 终态优先级：missing/error 排在「上一次渲染过的全文」之前（需求被删不得继续显示旧数据）
- 新增 retry-detail 的 [data-action] 委派（复用既有事件通道）
- 重绘前后回填评论草稿与当前 Tab（setDetailTab 与点击切换共用一处实现）
- dispose 释放：reqDetail.reset() + 清 lastRenderedDetail
- verify-pass 确认文案改从详情全文取「验收材料本体」（摘要里没有该字段）
- tests/req-detail-ondemand.test.ts board-wiring 分组 5 例（端到端经 attachBoard 渲染、404 不弹回看板、旧数据不遮终态、首屏 0 次详情请求、卸载后迟到响应不写回）
- npx vitest run tests/req-detail-ondemand.test.ts -t board-wiring → 5 passed；全文件 35 passed

### 改动文件

- `src/client/board-mount.ts`
- `tests/req-detail-ondemand.test.ts`

### 下一步

复核段（t-969e89）

---
