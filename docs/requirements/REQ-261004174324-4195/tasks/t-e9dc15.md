# t-e9dc15 手动命令与自动自举走同一条路（CLI 薄包装）·联调

> 需求：REQ-261004174324-4195 知识层自动自举：插件检测缺层即生成，并移除知识库页与侧栏入口

## 在做什么
手动命令与自动自举走同一条路（CLI 薄包装）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-04T09:57:11.152Z，窗口 session-a1f04215-5a72-4eb9-8633-2259d055f3a3）

这一步做完，仓库自己的知识层从「检查必红」变成「检查全绿」：新命令把陈旧的代码地图与符号表一次修齐，再跑一次什么都不用改；同时把之前那个把样式文件符号记错一行的老毛病一并清掉。

### 完成项

- 本仓实跑 --write：首次改写 4 份生成物（含既有陈旧漂移与符号归属错配）
- 第二次 --write 五份全部 [skip]，幂等成立
- 本仓 --check 退出码 0、输出「零漂移」——知识层门禁由红转绿
- 证据落 evidence/t3-cli.txt

### 改动文件

- `docs/requirements/REQ-261004174324-4195/evidence/t3-cli.txt`
- `docs/knowledge/code-map.md`
- `docs/knowledge/code-map.symbols.tsv`
- `docs/knowledge/design-tokens.md`
- `docs/knowledge/design-tokens.classes.tsv`

### 下一步

复核子卡：对照设计核对 CLI 契约与输出格式。

---
