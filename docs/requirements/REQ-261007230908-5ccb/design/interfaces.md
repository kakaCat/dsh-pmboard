# 接口设计（REQ-261007230908-5ccb）

> 本批无 HTTP 面、无工具 schema 变化；接口全部是**仓内模块契约**。
> 签名在此定死，拆分阶段按清单对卡。

## 接口清单 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 接口 id | 形态 | 职责 | serves |
|---------|------|------|--------|
| IF-1 | src/shared/error-code-registry.ts（新模块） | 大写码注册表：常量 + 查询函数 | FR-1 |
| IF-2 | tests/error-code-registry.test.ts（新用例） | 注册表 ⇆ 扫描双向一致硬门 + 条目形态约束 | FR-2 |
| IF-3 | tests/prompt-error-codes.test.ts（新用例） | prompt 文案出现的码 ⊆ 注册表 | FR-3 |
| IF-4 | src/shared/dual-field.ts（新模块） | snake/camel 双拼取值唯一实现 | FR-4 |
| IF-5 | src/client/toolviews/shared.ts（改） | 大写码→中文映射改从注册表派生 | FR-1 |

## IF-1 错误码注册表 <!-- serves: FR-1 -->

```ts
// src/shared/error-code-registry.ts —— 纯数据模块，零 import（client 会打包它）
export type CodeLayer =
  'application' | 'domain' | 'tools' | 'client' | 'http' | 'adapters' | 'repositories' | 'shared'

export interface ErrorCodeEntry {
  readonly code: string        // 形态 REQBOARD_[A-Z0-9_]+；唯一；按 code 字典序排列
  readonly message: string     // 中文语义，非空（种子优先级见下）
  readonly layer: CodeLayer    // 首个产生点所在分层（与报告 §3.2 分层口径一致）
}

export const REQBOARD_CODE_REGISTRY: readonly ErrorCodeEntry[]
export const REQBOARD_CODE_SET: ReadonlySet<string>          // 派生：entry.code 集合
export function errorCodeMessage(code: string): string | undefined  // 派生查询
```

- **message 种子优先级**（D-1 口径内）：① `src/client/toolviews/shared.ts:151` 既有映射；
  ② throw 现场错误消息提炼；不允许空串/「待补」。
- **收录口径**：= `scanErrorCodes().uppercase` 的码集合（136 个上下，以守卫实测为准）；
  NOISE_TOKENS（含 REQBOARD_XXX）与模板拼码一律不收（D-1）。
- **不抛错误码**：纯数据查询，miss 返回 undefined。

## IF-2 注册表一致性硬门 <!-- serves: FR-2 -->

`tests/error-code-registry.test.ts`（vitest），断言组：

| # | 断言 | 红时自助路径 |
|---|------|-------------|
| ① | `scanErrorCodes().uppercase` 的码 ⊆ 注册表（新码未注册即红，逐条点名） | 注册表补条目后重跑 |
| ② | 注册表 ⊆ 扫描结果（死条目即红） | 确认码已删后清条目 |
| ③ | 条目形态：code 匹配 `^REQBOARD_[A-Z0-9_]+$`、唯一、有序；message 非空；layer 合法 | 修条目 |
| ④ | NOISE_TOKENS ∩ 注册表 = ∅（D-1） | 移除占位/标识符条目 |
| ⑤ | 扫描器在场自检：注册表条目数 > 0 且等于扫描码数（读数打印） | — |

复用约束：只 import `tests/helpers/error-code-scan.ts` 的 `scanErrorCodes` / `NOISE_TOKENS`，
不复制任何正则（D-2）。

## IF-3 prompt 列码校验 <!-- serves: FR-3 -->

`tests/prompt-error-codes.test.ts`（vitest）：

- **收集面**：`src/**/*prompt*.ts` 与 `src/domain/prompt/generated/**`
  （与 error-code-scan 的 `isPromptFile` 同一口径——该函数需从 helpers 导出或同形复用，
  设计定：**helpers 导出 `isPromptFile`**，本用例与扫描器共用，防两套口径）。
- **形态**：只认独立字符串字面量内的 `REQBOARD_[A-Z0-9_]+`（同 QUOTED_RE 形态）；
  剔除 NOISE_TOKENS；`REQBOARD_*` 星号通配写法不匹配字面量形态，天然豁免。
- **断言**：收集到的码 ⊆ 注册表；违规逐条点名文件与码。
- **定位**（D-3）：子集断言不预设清单非空——G5 若改走「不列码」本用例空集通过，
  两种走向语义都成立。

## IF-4 双拼归一模块 <!-- serves: FR-4 -->

```ts
// src/shared/dual-field.ts
/** 按声明优先级取第一个「已定义」的拼法值（不在这里 trim/coerce——后处理留调用方）。 */
export function readDual(
  o: Record<string, unknown>, snake: string, camel: string, priority: 'snake' | 'camel',
): unknown

/** 两拼各 coerce 成 map 后取并集（camel 覆盖同 key）；两者皆无 → undefined。 */
export function dualMapMerged(
  o: Record<string, unknown>, snake: string, camel: string,
  coerce: (v: unknown) => Record<string, string> | undefined,
): Record<string, string> | undefined
```

四个调用点改写（**仅这 4 处**，其余双拼对不在 G10 范围）：

| 调用点 | 字段对 | priority | 后处理（留调用方，逐字保持） |
|--------|--------|----------|------------------------------|
| src/shared/protocol.ts:~1180 | skip_integration_reason / skipIntegrationReason | camel | 两键皆 undefined→''；String().trim().slice(0,300) |
| src/shared/protocol.ts:~1197 | dep_reasons / depReasons | 并集 | dualMapMerged + depReasonsOf coerce |
| src/shared/protocol.ts:~1220 | granularity_exempt / granularityExempt | snake | String().trim().slice(0,300) |
| src/application/internal/plan-granularity.ts:73 | granularity_exempt / granularityExempt | snake | String().trim() |

- **行为不变式**：三字段今日的优先级/并集/截断语义逐字保持（见 data-model.md 语义表）；
  本模块不抛错误码，非法值由调用方既有路径处理。
- **「单源」判据**：`??` 直连双键的写法在 4 处调用点归零，归一逻辑只有 dual-field 一处实现。

## IF-5 client 映射派生 <!-- serves: FR-1 -->

`src/client/toolviews/shared.ts` 的大写码→中文映射改为：

```ts
import { REQBOARD_CODE_REGISTRY } from '../../shared/error-code-registry.js'
const UPPER_MAP = Object.fromEntries(REQBOARD_CODE_REGISTRY.map(e => [e.code, e.message]))
// 最终映射 = { ...UPPER_MAP, ...LOWERCASE_MAP }（小写码键原样保留：invalid_transition 等）
```

- 仅数据源变化，无视觉/交互/布局改动（D-5）；`pnpm build:client` 重建 bundle（C-12）。
- 守卫：IF-2 之外加一条 grep 断言——shared.ts 不再出现 `REQBOARD_[A-Z]` 起头的
  大写码字面量键（防映射表回流成双源）。
