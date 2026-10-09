# 数据层与回滚设计：reqboard 体检第二批文案契约漂移修复（REQ-261007200706-89b7）

> 覆盖本仓铁律「数据层与回滚」：是否改表 / 改 schema、迁移方式与回滚；
> 以及 refactor 档的「行为等价验证」与「一次只改一类东西」。

## 数据层影响评估 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

**结论：零数据层改动。**

| 维度 | 评估 |
|------|------|
| 表 / schema | 不改。台账 JSON 分片、queue.json、comments.jsonl/history.jsonl 的字段结构零变化 |
| 迁移 | 不需要。无新字段、无格式版本号变化、无存量数据回写 |
| 配置项 | 不新增。`package.json` 仅动 `repository` 展示元数据与 `prompts:check` 脚本串 |
| 未来留痕文案 | FR-2 改 `support.ts:951` / `CreateRequirement.ts:130` 的留痕模板，**只影响改动后新写入的记录**；历史记录里的「三问」字样不回改（architecture.md 边界节已声明） |
| 探针产物 | 探针是只读扫描，无写盘产物（`--json` 只写 stdout） |

## 行为等价验证设计 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

refactor 档核心论证：**本批全部改动落在「文本常量」层，运行时行为等价**。
等价性不靠口头声明，靠以下四层可跑证据：

### 第一层：全量测试基线比对 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

- 命令：`pnpm test` 与 `tsx scripts/test-baseline.mts --check`（kb C-14 纪律）。
- 算过：退出码 0 且无新增失败；因文案改动必须同步更新的断言（见下）更新后转绿，
  其余测试逐字不动。

### 第二层：类型与构建 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

- 命令：`pnpm typecheck`（kb C-15）、`pnpm build`（kb C-11）、`pnpm build:client`（kb C-12，
  FR-1 触碰 `client/views/verification.ts` 后必跑）。
- 算过：退出码全 0；client 产物 `[verify-client] OK`。

### 第三层：机械检查新口径 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

- 命令：`pnpm prompts:check`（含扩面后的 prompt-path-probe）。
- 算过：退出码 0；`tsx scripts/prompt-path-probe.mts --specimen` 退出码 1（反例必红）；
  `grep` 判据逐条复核（FR-1 扫描面 agent-dh 零命中、FR-2 问数字样仅命中事实源文件、
  FR-4 叙事编号零命中、FR-5 注记命中行全部可归属保留表、FR-7「13 个」零命中）。

### 第四层：行为等价负例（证明「只改了文本」） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

- submit 六类分派不变：`SUBMIT_DISPATCH` 键集 diff 为空（代码评审 + 既有契约测试）。
- 拒绝回执 code 不变：负例用例构造 plan/archive 违规提交，断言 `code` 与改动前逐字一致、
  `message` 含下沉后的细则要点（FR-3 判据）。
- 探针退出码语义不变：对既有扫描面（fragments + round-state.ts）结果与改动前一致
  （扩面只加扫描对象，不改判定逻辑）。

### 必须同步更新的既有断言（预期红 → 更新 → 绿） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

| 测试 | 原因 |
|------|------|
| `tests/ask-confirm-prompt.test.ts` | FR-6 改了拦截清单表述；断言枚举串的用例改断「全部写路径」 |
| 断言 RunStatusTool/submit description 精确串或长度的用例 | FR-3/FR-4 文本变化（实施时以 `pnpm test` 首轮红单为准逐一定位） |
| `tests/kb-operations.test.ts`（若含探针命令登记断言） | FR-1 接线 prompts:check 后命令串变化时同步 |

## 分批与独立验证（一次只改一类东西） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

七组按「一类改动」独立验证，组间无耦合（改任何一组不影响其余组的判据）：

| 组 | 改动类别 | 独立验证口径 |
|----|---------|-------------|
| FR-1 | 路径字符串替换 + 探针扩面 | prompts:check 0 + specimen 红 + build:client OK |
| FR-2 | 问数字样清除 + doc_location 补齐 | grep 判据 + capture/create 契约测试 |
| FR-3 | description 瘦身 + message 增肥 | 预算断言 + 负例回执用例 |
| FR-4 | 叙事删除（出处挪注释） | grep 判据 + 受影响 prompt 测试 |
| FR-5 | 常量拆分 + 引用点归位 | grep 归属表 + layer-boundary 测试 |
| FR-6 | 两处描述改写 | ask-confirm-prompt 测试 + grep |
| FR-7 | 元数据/注释清理 | build + typecheck + grep |

实施顺序无依赖约束（纯文案改动互不阻塞）；唯一建议是 FR-1 探针扩面**最后验证**——
其余六组改完后扫描面才是干净的，避免探针把「还没改到的漂移」报成缺口造成噪音。

## 回滚设计 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

- **回滚粒度**：每组一个独立提交，`git revert <sha>` 单组回滚，互不影响；
  探针扩面（FR-1）回滚后 `prompts:check` 自动恢复旧口径（脚本串同提交回滚）。
- **无数据回滚**：无迁移即无逆向迁移；历史台账记录不受影响（本来就没回改）。
- **client 产物**：回滚源码后按 kb C-12 重跑 `pnpm build:client` 即可，无持久状态。
- **风险点（如实申报）**：FR-3 的 message 文本变长是**有意行为变化**（拒绝回执内容更全），
  若有下游断言了旧 message 精确串，回滚 FR-3 需同步回滚该断言——已在上表登记。
