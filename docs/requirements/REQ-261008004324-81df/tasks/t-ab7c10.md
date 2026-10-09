# t-ab7c10 跟进文案、徽章与地址段断言·复现

> 需求：REQ-261008004324-81df reqboard 红测试收口：A 类夹具跟进 + C 类环境基线

## 在做什么
跟进文案、徽章与地址段断言·复现

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/capture.test.ts tests/client-view.test.ts tests/node-panel-styles.test.ts tests/template-address-injection.test.ts tests/header-progress-responsive.test.ts` → 修复前失败、修复后通过（贴两次输出）

---
## 汇报 1（2026-10-07T17:12:32.774Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

复现段：四文件 9 条红读数到手，姊妹用例基线一并记录。

### 完成项

- 补文件证据：本段只读不写；下面列出的是被复现的四个测试文件（写入族阶段的文件凭据）
- 红读数：capture 1（21 例）/ client-view 3（69）/ node-panel-styles 1（15）/ template-address-injection 4（10 例：TC-9、TC-10 两臂、TC-11）
- 基线：姊妹用例 header-progress-responsive 22/22 绿（用于防宽度口径分叉）

### 改动文件

- `tests/capture.test.ts`
- `tests/client-view.test.ts`
- `tests/node-panel-styles.test.ts`
- `tests/template-address-injection.test.ts`

---
