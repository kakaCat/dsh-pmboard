# t-c7e9dc 把「知识库」入口和页面拿掉（含说明书同步）·研发

> 需求：REQ-261004174324-4195 知识层自动自举：插件检测缺层即生成，并移除知识库页与侧栏入口

## 在做什么
把「知识库」入口和页面拿掉（含说明书同步）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T10:00:35.186Z，窗口 session-a1f04215-5a72-4eb9-8633-2259d055f3a3）

这一步做完，侧栏那个「知识库」入口和它背后的页面彻底消失了：源码里连名字都搜不到，重新打出来的客户端包里也没有它的样式；说明书里原本写「侧栏有两个入口」的那一行也跟着改成了单条，免得后来人照着说明书去找一个不存在的页面。

### 完成项

- 删除 5 个文件：知识库视图 / 页面注册 / 样式分片 / 其单测 / 几何探针
- 客户端入口与样式拼接各删两处引用；样式归属章与分片拼接收敛如常
- 说明书侧栏插槽表由「两个入口」改为单条并注明知识库页已删；README 知识层节补一句自动自举
- 源码零命中（含 registerKnowledgePage）

### 改动文件

- `src/client/index.ts`
- `src/client/styles.ts`
- `docs/architecture/project-manual.md`
- `README.md`
- `src/client/views/knowledge.ts`
- `src/client/page/register-knowledge.ts`
- `src/client/styles/knowledge.ts`
- `tests/kb-client-page.test.ts`
- `scripts/knowledge-page-probe.mts`

### 下一步

联调子卡：客户端构建门禁 + 产物内无残留样式。

---
