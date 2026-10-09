# 错误码注册表与双拼归一单源（治理设施篇）

> **TL;DR**：reqboard 有 **133 个大写错误码**散落上百文件、**3 对双拼字段**各写一处归一。
> 现在两件事各有单源：码的事实源 = `src/shared/error-code-registry.ts`（**登记层，不迁移字面量**）；
> 扫描口径唯一实现 = `tests/helpers/error-code-scan.ts`；双拼取值唯一实现 = `src/shared/dual-field.ts`。
> 三条门把「新码漏注册 / 死条目 / prompt 幽灵码」变成下一次 `pnpm test` 的报红。
> 来源：REQ-261007230908-5ccb（体检报告 §4.3 的 G4 / G5 / G10）。

## 1. 旧状态的三种失效（为什么值得建门）

| 失效 | 表现 | 代价 |
|------|------|------|
| 码自己长出来 | 多窗口并发开发时新码直接进代码，没有任何清单知道它存在 | 只有等人想起来才发现 |
| prompt 与实现对不上 | prompt 里列的码 ≠ 代码会抛的码（漏列包装码、幽灵码） | 照 prompt 排障扑空 |
| 归一逻辑两份 | 同一「双拼字段取哪个」规则写在 protocol 与 plan-granularity 两处 | 改一处漏一处（实测：granularity 门禁绕开归一结果独立再读原始对象） |

## 2. 码的事实源与四条门

**分层职责**（互不替代）：

- `tests/helpers/error-code-scan.ts` — **口径**（哪些字样算码、注释/提示词/噪声如何排除）。全仓唯一正则实现。
- `src/shared/error-code-registry.ts` — **登记**（码 → 中文语义 → 分层）。代码可 `import`，client 也会打包它。
- `tests/fixtures/error-code-inventory.json` — **产生点与覆盖态**（测试专用，回答「这码在哪抛、测没测」）。

| 门 | 位置 | 断言 | 报红时怎么办 |
|----|------|------|-------------|
| ① 双向一致 | `tests/error-code-registry.test.ts` | 扫描码 ⊆ 注册表（新码漏注册即红）；注册表 ⊆ 扫描码（死条目即红） | 注册表补/删条目（按 code 字典序插入） |
| ② 条目形态 | 同上 | 码形态 `REQBOARD_[A-Z0-9_]+`、唯一、有序；message 非空且有中文；layer 受控 | 修条目 |
| ③ prompt 子集 | `tests/prompt-error-codes.test.ts` | prompt 文案面出现的码 ⊆ 注册表（子集断言，不要求 prompt 必须列码） | 注册（确认实现真会抛）或删文案 |
| ④ client 无回流 | 门 ① 内一节 | `toolviews/shared.ts` 不得再自持大写码字面量键 | 大写码改从注册表派生 |

**收录口径（全在扫描器里，别处不许再写一份）**：模板拼码 `REQBOARD_${…}` 不是字面量码；
占位 `REQBOARD_XXX`、标识符（`REQBOARD_CODE_REGISTRY` 等）、目录名常量、数值常量、env 后缀
一律进 `NOISE_TOKENS` 排除清单——**排除项是事实声明，不是补丁**，删条目会红。

## 3. 新增错误码的正确流程（四步，别跳步）

1. **先在代码里抛**（`throw`/`reject` 的 `code`）——注册表不是「设计期清单」，是「实现的事实」；
2. **跑守卫**：`npx vitest run tests/error-code-registry.test.ts` → 红，点名未注册的码；
3. **回注册表补条目**：`{ code, message（中文一句话，写「这是什么」不是抄码）, layer（首个产生点分层） }`，
   按 code 字典序插入；
4. **重跑绿**，并且 `npx vitest run tests/prompt-error-codes.test.ts` 仍绿（文案引用的码也合法）。

刷新产生点/覆盖态读数（码移动了、覆盖率变了才用）：

```bash
npx tsx tests/drill/refresh-error-code-inventory.mts
```

**反例（必须记住）**：别拿刷新钻把红变绿——`tier=unclassified` 必须归零，
「刷新」只把红变成**可解**，不把红变成绿。死条目同理：码真被删了要人工确认后再清。

## 4. 双拼字段归一：`src/shared/dual-field.ts`

`submit tasks[]` 的 3 对 snake/camel 字段，取值规则**只在 dual-field 一处实现**；
**后处理（trim / 截断 / coerce）留在调用方**——各字段后处理本就不同，拉齐它们是行为变更。

| 字段 | snake | camel | 取值优先级 | 后处理在谁那里 |
|------|-------|-------|-----------|---------------|
| 跳联调理由 | `skip_integration_reason` | `skipIntegrationReason` | **camel 优先** | protocol：trim + ≤300 |
| 依赖理由 | `dep_reasons` | `depReasons` | **两拼并集**（camel 覆盖同 key） | protocol：`depReasonsOf` coerce |
| 粒度豁免理由 | `granularity_exempt` | `granularityExempt` | **snake 优先** | protocol 截断 300 / granularity 门禁不截断（现状差异，刻意保留） |

调用点 4 个：`src/shared/protocol.ts`（3 处）+ `src/application/internal/plan-granularity.ts`（1 处）。
后者读的是**原始提交对象**（提交期门禁在 protocol 归一之前跑），所以它也必须走 dual-field，
不能改成只读归一后字段——这正是「单源」要防的那种就地分叉。

判定「单源没破」：`grep -rn "o\.granularity_exempt ?? o\.granularityExempt" src` 命中 **0**。

## 5. 边界（不要做的事）

- **不迁移 123 处字面量为常量引用**：注册表是登记层，不是替换层；「可机械检查」由扫描门达成，
  import 关系不是目的（全仓大改的收益为零、风险为面）。
- **小写码不进注册表**：它们是另外两张既有登记表（`domain/errors.ts` 的 `REQBOARD_ERROR_CODES`、
  `MoveRequirement.ts` 的 `TRANSPORT_CODE_BY_INTERNAL`），口径本来就靠表不靠正则。
- **prompt 校验用 token 级**：曾按「引号紧贴字面量」实现，实测只命中 1 个码（prompt 里的码嵌在
  中文句子中），形同虚设；改为 token 级 + 剔模板拼码/噪声后命中 24 个。散文里的 `REQBOARD_*`
  通配写法不构成码 token，天然豁免。

## 6. 出处与可复核命令

- 来源需求：REQ-261007230908-5ccb（体检第 4 批 · §4.3 的 G4/G5/G10）；体检报告：REQ-261007165643-4275。

```bash
npx vitest run tests/error-code-registry.test.ts   # 11 项：[读数] 注册表条目 133 = 扫描大写码 133
npx vitest run tests/prompt-error-codes.test.ts    #  3 项：[读数] prompt 面 24 码全部已注册
npx vitest run tests/dual-field.test.ts            # 10 项
npx vitest run tests/error-code-inventory.test.ts  # 存量口径守卫（并入生态，未替换）
```
