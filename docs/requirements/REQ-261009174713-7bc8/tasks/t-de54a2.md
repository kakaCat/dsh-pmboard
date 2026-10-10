# t-de54a2 core 类型逻辑单点化·研发

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
core 类型逻辑单点化·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/type-spec-snapshot.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-09T14:19:04.456Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

t10 两期完成：类型注册表装配点落根包、core 经装配端口消费、真分支改为查规格；卡面两条验收全过（grep 归零、规格快照仍全绿）。

### 完成项

- 新增 packages/pmboard-core/src/type-registry-port.ts：单写者装配端口（未装配即抛，绝不静默兜底）；注释写明为什么用装配期安装而不是逐层传参
- 契约加声明式字段 docQuality.failureSection（并纳入快照规范形，避免成为盲区）；feature 规格置真，值来自现行为
- 真分支改造：content-gate-wiring 的 req.category === 'feature' 改为 typeRegistry().get(...).docQuality?.failureSection（get 语义保证未知类型仍按不适用处理，行为等价）
- 装配接线两处：插件入口 src/index.ts 与全局测试夹具 tests/setup/hermetic-guard.ts 各装一次（缺类在装配期就炸）
- 判据：grep -rn "category === '" packages/pmboard-core/src → 0（另两处分别是注释与通配符校验，已改措辞与写法）
- 读数：typecheck 0、规格快照与类型层用例 9 文件 42 例全绿、全量 7253 例失败 19/失败文件 13（唯一新增项 header-progress-e2e 单跑 2/2 绿且它在 t1 基线里本就是红的，按 C-14 判抖动）

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/type-registry-port.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-type-kit/src/contract.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-type-kit/src/validate.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-type-feature/src/index.ts`
- `.worktrees/req-261009174713-7bc8/src/type-registry.ts`
- `.worktrees/req-261009174713-7bc8/src/index.ts`

### 下一步

交复核子卡 t-b40c96。

---
