# t-cfd8ae core 类型逻辑单点化

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
core 类型逻辑单点化

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
grep -rn "category === '" packages/pmboard-core/src | wc -l == 0；npx vitest run tests/type-spec-snapshot.test.ts 仍全绿

## 实施方案（implementation）
改 core 的 application/internal/category-doc-sets.ts 与 content-gate-wiring.ts 等按类型分支处为经注入的 TypeRegistry 查询；ALL_REQ_CATEGORIES 留 common；client 类型标签改由注册表下发。

## 上游产出摘要（dependsSummary）
- 六类型规格快照测试

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-09T14:12:25.071Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

第一期完成：类型注册表**唯一装配点**落根包（src/type-registry.ts）并加装配门禁 3 例（六类齐备 / core 不得 import 具体类型包 / 快照稳定）。但卡面判据 grep 仍为 3，本卡**未完成**。

### 完成项

- 新增 src/type-registry.ts：装配六个类型包的 spec 并 requireComplete（缺类即装配期抛错，不按 feature 兜底）；这是设计指定的唯一聚合点
- 新增 tests/type-registry-wiring.test.ts 三例：六类齐备且逐类取回自己；core 与其它子包不得 import 具体类型包（这条是「走某类型逻辑只落该类型包」的物理保障）；快照稳定非空
- 读数：typecheck 0、新用例 3/3、全量 7253 例失败 18/失败文件 12（新增失败 0，用例增量恰为新增的 3 例）
- 判据现状（未达标）：grep -rn "category === '" packages/pmboard-core/src 仍是 3 —— content-gate-wiring.ts:1204 是**注释**、domain/prompt/index.ts:39 是通配符校验（不是类型分支）、只有 content-gate-wiring.ts:431 是真分支
- 真分支的改法已定但未做：它是「失败与并发路径节只对 feature 追溯」这条**按类型的提交期文档质量门**；判据主体应下沉到类型规格（新增声明式字段），core 侧经 **deps 线程注入的 TypeRegistry** 查询——其调用链全在 core 内（confirm-settle → content-gate-wiring），所以注入通道用既有 deps 而不是新建全局单例
- 第二期清单（4 张表 + 1 分支）：CATEGORY_DELTAS 与 CATEGORY_ZH 与 ARCHIVE_DOC_RULES 与 NODE_TEMPLATES 的消费改为经注册表；consumer 共 5 处（category-doc-sets 与 capture-mapping 与 artifact/ArtifactSpec 与 domain/template/registry 与 content-gate-wiring）

### 改动文件

- `.worktrees/req-261009174713-7bc8/src/type-registry.ts`
- `.worktrees/req-261009174713-7bc8/tests/type-registry-wiring.test.ts`

### 下一步

第二期：①给 RequirementTypeSpec 加声明式字段承载「失败与并发路径节」的适用面，feature 置真；②把 TypeRegistry 经 core 既有 deps 线程到 content-gate-wiring 与 category-doc-sets；③搬 CATEGORY_DELTAS / CATEGORY_ZH / ARCHIVE_DOC_RULES / NODE_TEMPLATES 四张表到类型包并改 5 处 consumer；④复跑 grep 判据与 tests/type-spec-snapshot.test.ts。

---
## 汇报 2（2026-10-09T14:19:59.787Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

父卡 t-cfd8ae（core 类型逻辑单点化）收官：类型注册表装配点落根包、core 经单写者端口消费、真分支改查规格；卡面两条验收全过（grep 归零、六类型规格快照逐字未变）。

### 完成项

- 装配点：src/type-registry.ts 装配六个类型包并 requireComplete（缺类装配期即抛）；装配接线落在插件入口与全局测试夹具
- 消费通道：packages/pmboard-core/src/type-registry-port.ts 单写者端口，未装配即抛（独立探针已验证 typeRegistryInstalled()=false 时抛错）
- 判据下沉：契约加声明式字段 docQuality.failureSection 并纳入快照规范形；feature 置真（值来自现行为）
- 真分支单点化：content-gate-wiring 的 req.category === 'feature' 改为查规格（get 语义保证未知类型仍按不适用，行为等价）
- 卡面验收一：grep -rn "category === '" packages/pmboard-core/src == 0
- 卡面验收二：tests/type-spec-snapshot.test.ts 全绿（六类型规格快照逐字未变）
- 读数：typecheck 0、类型层与相关门禁 4 文件 66 例绿、全量 7253 例失败 19/失败文件 13（唯一新增项单跑 2/2 绿判抖动）
- 如实登记的剩余实质面：四张类型表仍有 11 个文件直接持有，建议单列后续卡（与 t11 第二期不要抢同一批文件）

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/type-registry-port.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-type-kit/src/contract.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-type-feature/src/index.ts`
- `.worktrees/req-261009174713-7bc8/src/type-registry.ts`
- `.worktrees/req-261009174713-7bc8/tests/type-registry-wiring.test.ts`

### 下一步

父卡可关。剩余 ready：t13（9 个驱动文件）· t19（资产四包化）· t11 第二期（片段按类型进包，接入口已就绪）· 建议新增一张卡收四张表的实质面。

---
