# 后端设计（REQ-261007230908-5ccb）

> sides=[backend] 的条件必交档：本批全部改动在插件 host 侧（src/shared、src/application、
> src/tools 文案、tests）+ 一处 client 数据源派生；无 HTTP 面、无台账/状态机变化。

## 模块落点 <!-- serves: FR-1, FR-4 -->

| 文件 | 动作 | 职责一句话 |
|------|------|-----------|
| src/shared/error-code-registry.ts | 新建 | 大写码注册表（纯数据，零依赖，client 可打包） |
| src/shared/dual-field.ts | 新建 | snake/camel 双拼取值唯一实现 |
| src/shared/protocol.ts | 改 3 处 | skip_integration_reason / dep_reasons / granularity_exempt 读取改调 dual-field |
| src/application/internal/plan-granularity.ts | 改 1 处 | granularity_exempt 读取改调 dual-field |
| tests/helpers/error-code-scan.ts | 改（仅导出） | 导出 isPromptFile 供 prompt 校验复用，扫描逻辑一行不动 |
| tests/error-code-registry.test.ts | 新建 | 注册表硬门（IF-2）+ client 无回流断言（T5） |
| tests/prompt-error-codes.test.ts | 新建 | prompt 码 ⊆ 注册表（IF-3） |
| src/tools/{OpenWindow,SkillInstall,Create,Status}Tool/prompt.ts | 改文案 | G5 补全漏列错误码（D-4） |
| src/client/toolviews/shared.ts | 改数据源 | 大写码映射从注册表派生（IF-5） |
| docs/requirements/REQ-261007230908-5ccb/closure-audit.md | 新建 | §4.3 十项 G 去向对照表 |

## 运行时与数据面 <!-- serves: FR-1, FR-2 -->

- **不改表 / 不改 schema**（覆盖 4）：台账（~/.dsh/reqboard 分片）、队列、状态机、HTTP envelope
  一律不动；无迁移、无回填、无开关。回滚 = git revert 各独立 commit。
- 注册表为编译期常量，零运行时成本；`REQBOARD_CODE_SET` / `errorCodeMessage()` 为派生查询。
- dual-field 为纯函数，无状态、无 IO；调用方错误路径（如 REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED）
  触发条件逐字不变。

## 并发与多窗口 <!-- serves: FR-2 -->

- 本仓多窗口并发加码是常态（inventory 测试头注释有实测记录）：硬门把漂移发现时点
  收敛到「下一次 pnpm test」，本批不引入锁或串行化设施。
- 注册表条目按 code 字典序排列，降低两窗口同时追加时的合并冲突面（同区追加→同点冲突，
  字典序分散插入点）。

## 构建与自检命令 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

```bash
pnpm vitest run tests/error-code-registry.test.ts tests/prompt-error-codes.test.ts  # 新门
pnpm vitest run tests/error-code-inventory.test.ts                                   # 存量守卫不回归
pnpm test && pnpm typecheck                                                          # 全量（C-14/C-15）
pnpm build:client                                                                    # IF-5 数据源变更（C-12）
```

## 风险与缓解 <!-- serves: FR-2, FR-3 -->

| 风险 | 缓解 |
|------|------|
| 注册表 136 条手工录入错漏 | T1 双向一致门：漏收/多收都红；录入由「扫描结果逐条誊 message」生成，不靠记忆 |
| prompt 校验误伤散文 | 只认字符串字面量形态 + NOISE_TOKENS 剔除；误伤案例出现时在测试里补钉 |
| dual-field 改变优先级语义 | data-model.md 语义表逐字段锁定现状；T7 行为回归原样绿才准收工 |
| client 打包注册表体积 | 纯数据 ~136 条 × 短字符串，KB 级；无依赖注入 bundle |
