# 测试策略（REQ-261007230908-5ccb）

> 验收口径全部可执行：跑什么命令、看到什么算过。
> 既有守卫一行不改（D-2）；新增两个用例文件 + 一个 grep 断言。

## 用例矩阵 <!-- serves: FR-1, FR-2, FR-3 -->

| 用例 | 文件 | 断言要点 | 通过判据 |
|------|------|---------|---------|
| T1 注册表⇆扫描双向一致 | tests/error-code-registry.test.ts | IF-2 表 ①②⑤ | `pnpm vitest run tests/error-code-registry.test.ts` 退出码 0 |
| T2 条目形态约束 | 同上 | IF-2 表 ③（形态/唯一/有序/message 非空/layer 合法） | 同上 |
| T3 占位排除 | 同上 | IF-2 表 ④（NOISE_TOKENS ∩ 注册表 = ∅，D-1） | 同上 |
| T4 prompt 码 ⊆ 注册表 | tests/prompt-error-codes.test.ts | IF-3：prompt 面字面量码逐条点名 | `pnpm vitest run tests/prompt-error-codes.test.ts` 退出码 0 |
| T5 client 无回流 | tests/error-code-registry.test.ts 内一节 | toolviews/shared.ts 无 `REQBOARD_[A-Z]` 字面量键（grep 形态断言） | 同 T1 |

## 双拼归一测试 <!-- serves: FR-4 -->

| 用例 | 内容 | 通过判据 |
|------|------|---------|
| T6 dual-field 单测 | readDual 两优先级 × 三态（仅 snake / 仅 camel / 双给）；dualMapMerged 并集与 camel 覆盖同 key | `pnpm vitest run tests/dual-field.test.ts` 退出码 0 |
| T7 行为不变回归 | 既有 plan 提交门禁用例原样绿（skipIntegration 缺理由仍抛 REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED、dep_reasons 并集仍生效、granularity 豁免仍放行） | `pnpm vitest run tests/submit-plan*.test.ts tests/plan-granularity*.test.ts`（以现存文件名为准）退出码 0 |
| T8 单源 grep | `grep -rn "skip_integration_reason' ?? \|granularity_exempt'\] ?? \|dep_reasons' ?? " src` 命中数 = 0（4 处直连写法归零） | 命中 0 |

## 负例钻（报红质量） <!-- serves: FR-2, FR-3 -->

| 钻 | 操作 | 期望 |
|----|------|------|
| N1 | 临时从注册表删一条码 → 跑 T1 | 红并点名该码 + 给「补条目」指引 |
| N2 | 临时往注册表塞一个 src 没有的码 → 跑 T1 | 红并点名死条目 |
| N3 | 临时在某 prompt.ts 写 `'REQBOARD_NOT_REAL'` → 跑 T4 | 红并点名文件与码 |
| N4 | 把 REQBOARD_XXX 塞进注册表 → 跑 T3 | 红（D-1 口径守卫） |

负例钻以「临时改 → 跑 → 还原」手工执行一次并记录输出进验收材料；
不固化成自动测试（自动测自己改源码会把守卫变成自指）。

## 全量回归 <!-- serves: FR-1, FR-4, FR-5 -->

- `pnpm test` 全绿（含既有 error-code-inventory 五组守卫——证明收敛未破坏存量）；
- `pnpm typecheck` 0 错（C-15）；
- `pnpm build:client` 通过且 verify-client OK（IF-5 改了 client 数据源，C-12）；
- 提交前与基线比对按 C-14。

## G5 补全核对 <!-- serves: FR-5 -->

- 补全后 T4 绿即机械凭证；另人工对照 architecture.md「G5 走向」表的四个工具逐格核对
  （prompt 现列 + 补列 = 实现所抛全集，抽查方式：对每个工具 `grep -n "REQBOARD_" src/tools/<T>/*.ts` 比对 prompt 与实现）。
- 收官对照表 closure-audit.md：十行齐全、「去向」「核验」列非空，验收单逐项打勾。
