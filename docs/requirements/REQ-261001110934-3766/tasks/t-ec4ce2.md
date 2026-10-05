# t-ec4ce2 写生成器 kb-build（代码地图 + 设计令牌 + 漂移门禁）·测试

> 需求：REQ-261001110934-3766 代码知识库能力调研：降 token + 快速理解项目

## 在做什么
写生成器 kb-build（代码地图 + 设计令牌 + 漂移门禁）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

printf '\n手改\n' >> docs/knowledge/design-tokens.md && npx tsx scripts/kb-build.mts --check → 退出码 1 且打印「[drift] docs/knowledge/design-tokens.md：首个差异在第 N 行」；随后还原文件

## 汇报 1（2026-10-01T04:43:56.287Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

t3 验收逐条跑通：确定性（两次零差异）、漂移可发现（退出码 1 + 差异行）、门禁命令退出码 0，证据已留档。

### 完成项

- npx tsx scripts/kb-build.mts --write 连跑两次 → 第二次零差异
- 手改 design-tokens.md 一行 → --check 退出码 1，打印漂移文件 + 首个差异行（含行号与「库内多出此行」）
- npm run kb:check 退出码 0（生成物零漂移 + 九项自检）
- 证据留档：evidence/t2-t3-build-test-output.txt

### 改动文件

- `docs/requirements/REQ-261001110934-3766/evidence/t2-t3-build-test-output.txt`

### 下一步

关闭 t3 父卡

---
