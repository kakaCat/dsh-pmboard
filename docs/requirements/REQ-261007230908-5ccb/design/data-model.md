# 数据模型（REQ-261007230908-5ccb）

> 本批不改台账 schema、不做数据迁移（覆盖 4：明确「不改表」）。
> 数据契约 = 注册表条目形态 + 双拼字段归一语义表。

## 注册表条目契约 <!-- serves: FR-1 -->

| 字段 | 类型 | 约束 |
|------|------|------|
| code | string | `^REQBOARD_[A-Z0-9_]+$`；全表唯一；条目按 code 字典序排列（review 友好） |
| message | string | 非空中文语义；种子优先级 ① toolviews/shared.ts 映射 ② throw 现场消息提炼 |
| layer | CodeLayer | 受控枚举 8 值（application/domain/tools/client/http/adapters/repositories/shared）；取首个产生点分层 |

- **全集**：= `scanErrorCodes().uppercase` 码集合（报告口径 136±2；以守卫实测为准，不写死数字）。
- **排除**（D-1）：REQBOARD_XXX（占位）、REQBOARD_ERROR_CODES / REQBOARD_DATA_ROOT /
  REQBOARD_SCHEMA_VERSION / REQBOARD_NO_ITEM_RESULT（NOISE_TOKENS 全部）、模板拼码 `REQBOARD_${…}`。
- **派生物**：`REQBOARD_CODE_SET`（Set）与 `errorCodeMessage()` 由 REGISTRY 机械派生，
  不允许手工另维护一份（单源）。

## 与存量 fixture 的边界 <!-- serves: FR-2 -->

| 数据 | 位置 | 角色 | 本批动作 |
|------|------|------|---------|
| error-code-inventory.json | tests/fixtures/ | 口径清单 + 产生点锚 + 覆盖态（测试专用） | 不动；刷新钻不变 |
| REQBOARD_CODE_REGISTRY | src/shared/ | 码 → 语义/分层（**代码可 import** 的事实源） | 新增 |
| toolviews 映射 | src/client/toolviews/shared.ts | 渲染用码→中文 | 大写码部分改为派生（IF-5） |

两者职责不重叠：fixture 回答「这个码在哪产生、测没测」，注册表回答「这个码是什么、怎么说」。
一致性由 IF-2 硬门保证，不靠人同步。

## 双拼字段归一语义表 <!-- serves: FR-4 -->

归一后行为必须与今日逐字一致；本表是判据的事实源（对照 protocol.ts / plan-granularity.ts 现状）：

| 字段 | snake | camel | 取值优先级 | 后处理 | 空值语义 |
|------|-------|-------|-----------|--------|---------|
| 跳联调理由 | skip_integration_reason | skipIntegrationReason | **camel 优先**（`o.camel ?? o.snake`） | String().trim().slice(0,300) | 两键皆 undefined → ''（不抛）；skipIntegration=true 且空 → REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED |
| 依赖理由 | dep_reasons | depReasons | **并集**（camel 覆盖同 key 条目） | depReasonsOf coerce（字符串数组 `"t2=理由"` → map） | 两者皆无 → undefined（键不出现） |
| 粒度豁免理由 | granularity_exempt | granularityExempt | **snake 优先** | String().trim().slice(0,300)（protocol 侧）/ String().trim()（granularity 侧） | 空串 → 键不出现，不冒充豁免 |

- 注意两处 granularity 后处理的**差异是现状事实**（protocol 截断 300、plan-granularity 不截断），
  本批**保留差异不拉齐**——归一的是「双键取值」，不是「后处理」；拉齐属行为变更，出边界。
- plan-granularity.ts:73 读的是**原始提交对象**（提交期门禁在 protocol 归一之前跑），
  故它必须调 dual-field，不能改为只读归一后字段。

## 收官对照表契约 <!-- serves: FR-5 -->

`docs/requirements/REQ-261007230908-5ccb/closure-audit.md`，表头定死：

| 列 | 内容 |
|----|------|
| G 编号 | G1…G10（与报告 §4.3 逐字对应） |
| 建议摘要 | 一句话 |
| 去向 | 已落地：<REQ 编号> / 本批：<FR 编号> / 不做：<理由> |
| 核验 | 可跑命令或文档链接 |

约束：十行齐全、每行「去向」非空；G5 的去向在本批验收时按 D-4 实落地形态填写。
