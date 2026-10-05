# t-548aca 发版门禁：产物归属章 + CSS 分片截断信号·研发

> 需求：REQ-261001101739-25c6 修复流程节点刷新后样式全丢（样式表归属）

## 在做什么
发版门禁：产物归属章 + CSS 分片截断信号·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

pnpm build:client → exit 0，末行含「关键符号齐全, 样式归属章在场, CSS 分片完整」

## 汇报 1（2026-10-01T02:57:25.342Z，窗口 session-96ee4e52-6798-4e5b-b3a3-946152bfaf2a）

发版多了一道保险：构建产物里少了样式归属信息、或 CSS 分片被截断，构建当场失败，坏包发不出去。

### 完成项

- verify-client-build.mjs 新增 ownership=['dataset.plugin=','dataset.pluginCss='] 检查（缺失非零退出并指名原因）
- 截断信号改挂到 src/client/styles/*.ts（每份以模板字符串收尾）+ 校验 styles.ts 仍含 injectStyles(，补 readdirSync 导入
- pnpm build:client → [verify-client] OK bundle=319777 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整

### 改动文件

- `scripts/verify-client-build.mjs`

---
