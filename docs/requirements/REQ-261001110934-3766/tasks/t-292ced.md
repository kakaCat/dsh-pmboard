# t-292ced 写生成器 kb-build（代码地图 + 设计令牌 + 漂移门禁）·研发

> 需求：REQ-261001110934-3766 代码知识库能力调研：降 token + 快速理解项目

## 在做什么
写生成器 kb-build（代码地图 + 设计令牌 + 漂移门禁）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx tsx scripts/kb-build.mts --write 连跑两次 → 第二次输出「零漂移」；且 wc -l docs/knowledge/code-map.symbols.tsv 与 python3 docs/requirements/REQ-261001110934-3766/evidence/volume-probe.py 打印的骨架条数一致

## 汇报 1（2026-10-01T04:43:48.897Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

生成器落地：代码地图与前端令牌从此是**可重跑的确定性产物**——改源码后重跑，忘了重跑门禁会红；手改生成物也会被当场抓出，不会再出现「文档写着一套、代码是另一套」。

### 完成项

- scripts/kb-build.mts 落盘：code-map.md/.symbols.tsv、design-tokens.md/.classes.tsv、INDEX 生成区；--write/--check/--backfill 三模式
- 确定性：连跑两次零差异（内容不含时间戳）；手改一行 → --check 退出码 1 且指出首个差异行（含行号与「库内多出此行」）
- 口径对齐：符号表行数 = 体积探针当次口径（当前 1,759；卡里 1,665 是新增代码前旧基线）
- 预算内：code-map.md 45 行、design-tokens.md 147 行（均 ≤200）
- 复用 t1 语法单点（renderIndexLine），不复制解析器

### 改动文件

- `scripts/kb-build.mts`

### 下一步

联调：与自检/门禁串起来（kb:check）

---
