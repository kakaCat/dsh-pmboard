# t-edc290 写生成器 kb-build（代码地图 + 设计令牌 + 漂移门禁）

> serves: FR-1, FR-4, FR-7, FR-10（FR→任务 追溯标注；对应测试见 tests/test-evidence.md 的 covers 行）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
写生成器 kb-build（代码地图 + 设计令牌 + 漂移门禁）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx tsx scripts/kb-build.mts --write 连跑两次第二次无文件差异；code-map.symbols.tsv 行数与 `python3 docs/requirements/REQ-261001110934-3766/evidence/volume-probe.py` 当次打印的骨架条数一致（2026-10-01 实测 1,727；1,665 是新增代码前的旧基线）；手工改 design-tokens.md 一行后 npx tsx scripts/kb-build.mts --check 非零退出并打印漂移文件与首个差异行。

## 实施方案（implementation）
scripts/kb-build.mts（npx tsx 运行）：扫 src/**/*.ts 产出 code-map.md（模块级 ≤200 行）与 code-map.symbols.tsv（file/symbol/kind/signature）；扫 src/client/styles*.ts 产出 design-tokens.md（颜色/变量/断点/类名前缀分组，各带锚点）与 design-tokens.classes.tsv；只写 INDEX 的 kb:generated 标记区；支持 --write 与 --check；语法与预算判定复用 t1 的 domain 单点。

## 上游产出摘要（dependsSummary）
- 定知识层领域模型与索引语法（纯函数单点）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史

## 实施现状（开工前必读 · 本窗口 2026-10-01 补充）

- **代码已落地**：`scripts/kb-build.mts`（生成器：code-map.md + symbols.tsv + design-tokens.md + classes.tsv + INDEX 生成区；`--write`/`--check`）。
- **本卡只做「按卡验收 + 补缺口 + 汇报」，不要重写**；验收不过再修。
- 已实测（命令与输出摘录见 `docs/requirements/REQ-261001110934-3766/evidence/t2-t3-build-test-output.txt`）：
  - `npx tsx scripts/kb-build.mts --write` 连跑两次 → 第二次零差异；`--check` 退出码 0。
  - 手工改 `design-tokens.md` 一行 → `--check` 退出码 1，并打印首个差异行（含行号与"库内多出此行"）。
  - `code-map.symbols.tsv` 行数 = **体积探针当次口径 1,727**（卡里写的 1,665 是新增代码**之前**的基线，已过期；以 `python3 …/evidence/volume-probe.py` 当次输出为准）。
  - `design-tokens.md` 147 行 ≤200；`code-map.md` 45 行 ≤200。
## 汇报 1（2026-10-01T04:47:13.769Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

代码地图与前端令牌成了可重跑的确定性产物：改源码后忘了重生成会被门禁当场拦住，手改生成物也会被抓出——「文档与代码不一致」这类腐烂从此可见。

### 完成项

- 生成器 kb-build 落盘（三模式：--write / --check / --backfill）
- 确定性零漂移；手改生成物 → 非零退出并指出首个差异行
- 与自检/门禁串成 pnpm run kb:check（退出码 0）
- 证据：evidence/t2-t3-build-test-output.txt、t11-backfill.txt

### 改动文件

- `scripts/kb-build.mts`
- `package.json`

### 下一步

t4 只读工具与检索用例

---
