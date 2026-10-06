# t-7acec4 详情页路径格显示绝对路径，未判定不划线·研发

> 需求：REQ-261005143615-5ab1 详情页文档路径绝对化 + 缺失判据按需求自身工作区

## 在做什么
详情页路径格显示绝对路径，未判定不划线·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T06:50:10.197Z，窗口 session-ea620b75-2385-4d9b-8ff0-c02ae4b6d6e2）

研发段完成：详情页的文档路径现在按服务端给的绝对路径显示与打开；「判不了」与「不存在」在页面上终于是两种画法——前者灰虚线不划线，后者才划线。

### 完成项

- 路径格：有 absPath 就显示并打开绝对路径，旁边留台账相对路径小字（data-doc-relpath）
- 未判定行新画法 dsh-pm-doc-unknown：不划线、不套 dsh-pm-doc-missing，文案说「未判定 · 读根不可得」
- file-missing 行画法逐字保持（划线 + dsh-pm-doc-missing + 文件缺失）
- 生成物行同规则支持 absPath
- 样式分片补 .dsh-pm-doc-unknown（虚线边框、不划线）
- 新增 tests/docs-panel-states.test.ts 六例（TC-5/TC-6 及同页并存）

### 改动文件

- `src/client/views/panels/docs.ts`
- `src/client/styles/panel.ts`
- `tests/docs-panel-states.test.ts`

### 下一步

t4 兼容断言；t5 真机对账

---
