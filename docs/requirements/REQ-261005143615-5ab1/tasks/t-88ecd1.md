# t-88ecd1 详情页路径格显示绝对路径，未判定不划线

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
详情页路径格显示绝对路径，未判定不划线

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
npx vitest run tests/docs-panel-states.test.ts 全绿：unknown 行 HTML 不含 line-through 与 dsh-pm-doc-missing，file-missing 行仍含两者，有 absPath 的行 data-open-doc 等于该绝对路径；pnpm build:client 输出 [verify-client] OK。

## 实施方案（implementation）
src/client/views/panels/docs.ts：路径格优先渲染 absPath（data-open-doc=absPath，小字给台账相对路径 data-doc-relpath）；stateText/stateNote 加 unknown（未判定 / 读根不可得…）；unknown 行不套 dsh-pm-doc-missing 内联划线；generated 行同规则。新增 tests/docs-panel-states.test.ts 断言 TC-5/TC-6。

## 上游产出摘要（dependsSummary）
- 定契约：未判定态与 absPath 加性字段 + 多根读取口

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T06:50:36.339Z，窗口 session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2）

这一步做完，详情页里的文档路径终于是「点开就能开」的绝对路径；而「这台机器判不了」不再被画成「文件不存在」——划线只留给真的缺失。

### 完成项

- 路径格显示与打开改走服务端给的绝对路径（附台账相对路径小字）
- 新增未判定画法 dsh-pm-doc-unknown：灰虚线、不划线、不可点
- file-missing 画法逐字保持（划线 + dsh-pm-doc-missing）
- 生成物行同规则；样式分片补新类
- 新增 tests/docs-panel-states.test.ts 六例；面板用例 41 例全绿；build:client 过验；tsc 0 错误

### 改动文件

- `src/client/views/panels/docs.ts`
- `src/client/styles/panel.ts`
- `tests/docs-panel-states.test.ts`

### 下一步

t4 兼容与回滚断言；t5 真机对账

---
