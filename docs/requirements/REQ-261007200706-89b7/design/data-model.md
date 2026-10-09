# 数据模型：reqboard 体检第二批文案契约漂移修复（REQ-261007200706-89b7）

> 验收前置补档（本需求设计阶段已交付 architecture.md + migration.md 并通过确认；
> 本份按仓库「验收前置文档」口径补数据模型视角，内容与既有两份一致、不引入新决策）。

## 数据层结论：零改动 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

| 维度 | 读数 | 依据 |
|------|------|------|
| 表 / schema | 不改 | 本批 diff 未触碰 `src/repositories/**` 与任何台账分片读写路径 |
| 字段 | 不新增、不改名、不改类型 | 工具 schema 的**结构与键名**逐字不变（只改 description 文本）；见 `design/interfaces.md` |
| 迁移 | 不需要 | 无新字段、无格式版本号变化、无存量回写 |
| 台账历史 | 不回改 | 仅 `support.ts` / `CreateRequirement.ts` 的**留痕模板文案**变化，只影响此后新写入的记录 |
| 配置 | 不新增 | `package.json` 只改 `repository`（展示元数据）与 `prompts:check` 脚本串 |

## 本批「数据面」的真实形态：文本常量与规则表 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

本批改动的都是**字符串常量、注释与元数据**，其"数据模型"是常量表本身：

| 常量 / 表 | 位置 | 本批变化 |
|-----------|------|---------|
| `LONG_TEXT_STYLE_NOTE` / `LONG_TEXT_SPLIT_NOTE` / `LONG_TEXT_ARG_NOTE` | `src/tools/shared.ts` | 由 1 个常量拆为 2 段 + 1 拼接（语义分级） |
| `LONG_TEXT_FIELDS`（幂等/追加）与 `LONG_TEXT_STYLE_ONLY_FIELDS`（一次性副作用） | `src/tools/shared.ts` | 原单一清单拆为两张；`ALL_LONG_TEXT_FIELDS` 为并集 |
| `CAPTURE_QUESTION_IDS` | `src/application/internal/capture-mapping.ts` | **值不变**（5 键）；本批只把文案里的手写问数清零，未动表 |
| `AGENT_SURFACE_DIRS` / `AGENT_SURFACE_FILES` / `FORBIDDEN_PATTERNS` / `WHITELIST` | `scripts/prompt-path-probe.mts` | 新增扫描面与禁词硬规则；白名单补 3 条（各带理由） |
| `SUBMIT_PROMPT` | `src/tools/SubmitTool/prompt.ts` | 1966 → 1289 字符（细则下沉，语义点未丢） |

## 留痕文本的兼容口径 <!-- serves: FR-2, FR-3 -->

- `support.ts` / `CreateRequirement.ts` 的台账留痕模板改为不数问数；**历史记录里的旧字样不回改**
  （避免"改文案顺带重写历史"这类不可审计操作）。
- 被测试锁定的措辞（如「未经弹框逐问确认」）原样保留——它不含问数，且是"agent 代理立项不得冒充
  人工确认"的判据锚点（`tests/create-delegated-owner.test.ts`）。

## 无迁移、无回滚数据面 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

无迁移即无逆向迁移；回滚粒度按卡 `git revert` 单提交，`prompts:check` 的脚本串随同提交回滚。
详细论证见 `design/migration.md`（本份不重复）。
