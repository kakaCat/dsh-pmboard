# 架构设计（REQ-261007230908-5ccb）

> 体检第 4 批·治理设施：错误码注册表 + 双拼归一单源 + 收官盘点。
> 核心裁定：收敛存量扫描设施（D-2），注册表是「登记层」不是「替换层」。

## 总体结构 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

```
┌─ src/shared/error-code-registry.ts   ← 新增·唯一事实源（纯数据，零依赖）
│    REQBOARD_CODE_REGISTRY: ErrorCodeEntry[]
│    REQBOARD_CODE_SET / errorCodeMessage()
│
├─ 硬门（FR-2）tests/error-code-registry.test.ts   ← 新增
│    scanErrorCodes()（既有·口径唯一，D-2） ⇆ 注册表 双向一致
│
├─ prompt 校验（FR-3）tests/prompt-error-codes.test.ts ← 新增
│    *prompt*.ts + generated/** 中的码字面量 ⊆ 注册表
│
├─ client 同源（FR-1）src/client/toolviews/shared.ts
│    大写码映射改为从注册表派生（数据同源，无 UI 行为变化，D-5）
│
├─ 双拼单源（FR-4）src/shared/dual-field.ts        ← 新增
│    readDual() / dualMapMerged()
│    调用方：protocol.ts ×3 + plan-granularity.ts ×1
│
└─ 收官（FR-5）docs/requirements/REQ-261007230908-5ccb/closure-audit.md
     §4.3 十项 G 去向对照表（不改已归档的体检报告原文）
```

## 关键取舍 <!-- serves: FR-1, FR-2 -->

- **收敛而非新建（D-2）**：`tests/helpers/error-code-scan.ts` 保持口径唯一实现，
  新守卫一律 import `scanErrorCodes()`，不另写扫描正则。既有 inventory 五组守卫原样保留，
  注册表一致性是其**相邻生态**而非替代品（inventory 管「清单↔扫描」，注册表管「注册表↔扫描↔prompt」）。
- **登记层不替换字面量（需求 N1）**：123 个产生点的 `'REQBOARD_X'` 字面量不迁移为常量引用，
  避免 123 文件大改；「可机械检查」由扫描硬门达成，不由 import 关系达成。
- **注册表必须纯数据**：client bundle 会打包它（toolviews/shared.ts 派生），
  故不得 import node 模块或任何带副作用代码。
- **收官表落本需求目录（不改归档报告）**：体检报告属已归档 REQ-261007165643-4275，
  归档文档不回写；对照表独立成文 `closure-audit.md`，验收材料引用它。

## G5 走向：补全（D-4） <!-- serves: FR-3, FR-5 -->

采用「补全 prompt 清单」而非「改定性表述」，理由（D-4 原话裁定的推荐路径）：

1. FR-1 注册表落地后，四处漏码补全只是文案加法，成本极低；
2. FR-3 的 prompt 校验需要「prompt 列码」这一形态真实存在才有守护对象；
3. 与第三批 G3「description 瘦身」不冲突——补的是「错误码：」一行内的码，不是加段落。

补全清单（实读复核后的现状）：

| 工具 | prompt 现列 | 实现另抛（漏列） | 证据 |
|------|------------|----------------|------|
| OpenWindowTool | OPEN_WINDOW_UNAVAILABLE | REQBOARD_OPEN_WINDOW_FAILED | OpenWindowTool/prompt.ts:23 vs 实现包装码 |
| SkillInstallTool | DISABLED/ASSET_MISSING/UNKNOWN_SKILL/WRITE_FAILED | REQBOARD_SKILLS_INSTALL_FAILED | SkillInstallTool.ts:76 |
| CreateTool | OWNER_WINDOW_NOT_LIVE | REQBOARD_WINDOW_BOUND / INVALID_INPUT / INVALID_WORKSPACE | CreateTool/prompt.ts:24 vs 用例层 |
| StatusTool（承 RunStatus） | —（合并后无码清单） | REQBOARD_REQUIREMENT_NOT_FOUND | 报告 §3.2（run_status 已并入 status，第三批） |

## 失败与降级设计 <!-- serves: FR-2, FR-3 -->

- **新码未注册**：注册表硬门红 + 点名 + 自助路径（注册表补条目 → 重跑守卫）。
  沿用既有纪律「报红必须给路」，不把红变绿、不静默放行。
- **注册表死条目**（注册了 src 已不抛的码）：反向一致用例红——防「注册表比事实乐观」。
- **占位/模板拼码误入**：REQBOARD_XXX 与 NOISE_TOKENS 全部字样断言不在注册表（D-1）；
  模板拼码 `REQBOARD_${…}` 非字面量，扫描口径本就不计，无需额外规则。
- **prompt 校验的假阳性防线**：只认独立字符串字面量形态（与 scan 的 QUOTED_RE 同形），
  散文中 `REQBOARD_*` 通配写法（带星号）不匹配字面量形态，不会误伤。

## 与既有设施的关系 <!-- serves: FR-2, FR-4 -->

| 既有设施 | 本批动作 |
|---------|---------|
| tests/helpers/error-code-scan.ts | **一行不改**（口径唯一，D-2） |
| tests/error-code-inventory.test.ts + fixture | 原样保留；刷新钻不变 |
| tests/fixtures/error-code-exempt.json | 不动（存量豁免面） |
| src/domain/errors.ts（小写码表） | 不动（N3：小写码无缺口） |
| src/client/toolviews/shared.ts 映射 | 大写码部分改为注册表派生；小写码键原样保留 |
| protocol.ts / plan-granularity.ts | 仅 4 处双拼读取点改调 dual-field，其余不动 |
