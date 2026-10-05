---
req: REQ-261001143526-8475
doc: interfaces
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 接口设计 · 规范条目 / 同步脚本 / 门禁检查 / 提示词接入（REQ-261001143526-8475）

> **TL;DR**：新增 **1 个脚本**（`kb-conventions-sync.mts`，`--write|--check`）、**1 项门禁检查**（`kb-probe` K10：覆盖度 + 四要素完整性）、
> **1 个规范结论域**（`docs/knowledge/operations.tsv` 覆盖清单，生成物）；规范页新增 `## 工程操作` 节；
> 提示词加 4 处句子（common 总纲 + 三阶段各一句）。既有 10 条规范、台账 schema、工具签名**一律不动**。

## 规范条目格式（写作契约） `serves: FR-1, FR-2`

```md
## 工程操作 #operations

> 时机四档：开工前 / 改动后 / 提交前 / 发版前（Agent 按当前阶段取用，不必一次读完）

### C-11 改了客户端源码必须重建 bundle #c-11
- 时机：改动后（提交前复核）
- 命令：`pnpm build:client`
- 期望：`[verify-client] OK … 样式归属章在场, CSS 分片完整`
- 失败怎么办：缺归属章 → 见 C-05；分片截断 → 检查 `src/client/styles/*.ts` 是否以模板字符串收尾
```

| 要素 | 必填 | 判据（K10 校验） |
|---|---|---|
| `- 时机：` | 是 | 取值必须是 `开工前` / `改动后` / `提交前` / `发版前` 之一 |
| `- 命令：` | 是 | 反引号内必须能在本仓执行（npx/pnpm/node/python3/tsx 起头）且**路径存在**（沿用 K8 口径） |
| `- 期望：` | 是 | 非空、≤200 字符，须含可对照的锚点（如 `OK` / 退出码 / 具体文案） |
| `- 失败怎么办：` | 是 | 非空，且至少指向一条既有规范 id（`C-NN`）或修复位置（文件路径） |

**索引行**（既有行语法，`## 规范` 节）：

```
- kb-conventions-c-11 · standard · 改客户端必须重建 bundle · → conventions.md#c-11
```

## 同步脚本 `scripts/kb-conventions-sync.mts` `serves: FR-3, FR-4`

```bash
npx tsx scripts/kb-conventions-sync.mts --write    # 为覆盖缺口生成候选骨架（只加不改）
npx tsx scripts/kb-conventions-sync.mts --check    # 与库内比对；有缺口 → 退出码 1（CI 门禁）
```

| 项 | 契约 |
|---|---|
| 输入 | `package.json` 的 `scripts`（全部）+ 本文件内的 `EXTRA_ENTRIES`（`scripts/` 必跑入口白名单）+ `EXCLUDED`（排除表，每条必须写理由） |
| 输出（`--write`） | ① 在 `## 工程操作` 节**追加**缺失条目的骨架（`### C-NN 标题 #c-nn` + 四个要素行，`命令`/`期望`自动填、`时机`按映射表填、`失败怎么办` 留 `（待补：写清失败信号与修复位置）`）；② 重写 `docs/knowledge/operations.tsv`（覆盖清单，见数据模型） |
| 幂等 | 已有条目**一字不改**（按条目 id 判定：`kb-conventions-c-NN`）；连跑两次第二次零差异 |
| `--check` 退出 | 有缺口（脚本未覆盖）→ 1；覆盖齐但 `operations.tsv` 漂移 → 1；全齐 → 0 |
| 编号分配 | 取规范页现有 `C-NN` 最大值 +1（不依赖索引，可重生成） |
| 失败响亮 | 覆盖清单为空 / 解析 `package.json` 失败 / 规范页缺 `## 工程操作` 节 → 抛错并给出修复命令 |

## 门禁检查 `kb-probe` 新增 K10 `serves: FR-4`

| 项 | 契约 |
|---|---|
| 检查名 | `K10 工程操作覆盖度` |
| 判据 1 | 覆盖清单里每个「必跑项」都能在规范页找到对应条目（`命令：` 文本包含该项命令） |
| 判据 2 | 每条 `C-NN` 的四要素齐全且合法（见上表） |
| 判据 3 | `operations.tsv` 与当次扫描结果一致（漂移即红） |
| 失败输出 | 人读一行 + `--json` 结构化：`{ check: 'K10', ok: false, detail: '缺：build:client（未见条目）/ 四要素缺「期望」：C-13', where: 'docs/knowledge/conventions.md' }` |
| 退出码 | 任一失败 → 1（不设"警告放过"） |

## 提示词接入 `serves: FR-5, FR-7`

| 文件 | 加什么 | 为什么在这 |
|---|---|---|
| `src/domain/prompt/fragments/common/iron-rules.md` | 总纲 3 句：**①** 开工前 `reqboard_kb(kind='standard')` 查规范；**②** 改完按条目自证（贴命令与输出）；**③** 收尾把新增工程操作沉淀进规范页并跑 `kb:check` | 该片段 `priority=floor`、**永不裁剪**，保证每个节点都看到 |
| `fragments/brainstorming/{light,heavy}.md` | 一句：写「判定标准」时把可跑的校验写进去（用规范页里的命令） | 需求阶段的措辞强度 |
| `fragments/design/{light,heavy}.md` | 一句：设计的「验收口径」直接引用规范页条目 id（`C-NN`），别自造命令 | 设计阶段要能让拆分照抄 |
| `fragments/implementing/{light,heavy}.md` | 一句：开工先查规范、改完自证；收尾缺口交 `kb-conventions-sync --write` 后补条目 | 实施阶段的主战场 |

**预算**：4 处新增合计 ≤ 900 字符（`common` 3 句 ≈ 400，三阶段各 1 句 ≈ 150×3）；
`prompt-gates` 断言 6×2×6 全部组合仍 ≤ `DEFAULT_PROMPT_BUDGET`，且 floor 片段未被裁。

## 检索契约 `serves: FR-6`

| 入口 | 用法 | 期望 |
|---|---|---|
| 工具 | `reqboard_kb(kind='standard', query='打包')` | 命中含"打包/构建"的条目（一句话与 id） |
| 工具 | `reqboard_kb(id='kb-conventions-c-11')` | 取该条四要素正文（≤预算） |
| HTTP | `GET /dashboard/api/reqboard/kb?kind=standard&query=打包` | 与工具同构 |
| 看板 | 「知识库」页 `## 规范` 节 | 列出全部条目行（含新增工程操作条目） |

## 与既有接口的关系 `serves: FR-7`

| 既有接口 | 变化 |
|---|---|
| 既有 10 条规范（C-01…C-10） | **语义与 id 零变化**；只在必要时对齐措辞 |
| `reqboard_submit(kind=archive)` | **入参零变化**（沉淀不靠归档字段驱动，靠覆盖缺口驱动） |
| `reqboard_kb` / `GET /kb` / 看板知识库页 | **签名零变化**（新增条目自动可检索） |
| `kb-probe` 既有 K1–K9 | **判据零变化**；仅新增 K10 |
| 提示词片段产物 | 需重跑 `node scripts/inline-prompt-fragments.mjs` + `check-prompt-fragments.mjs`（这是 C-04 类的工程操作，本身也要进规范页——自举） |
