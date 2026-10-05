---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: [backend]
---

# 设计 · 数据模型与契约（REQ-261004174324-4195 知识层自动自举）

> 本需求**不新增业务实体**，数据面只有三类：① 自举产物文件（知识层落盘物）；② 用例返回值对象；③ 新增配置字段。
> 故本文件按"契约表 + 不变量"写，不画 ER 图。

## 实体总览 `serves: FR-3`

| 实体 | 载体 | 生命周期 | 谁写 |
|---|---|---|---|
| 知识索引 `INDEX.md` | `docs/knowledge/INDEX.md` | 长期（进版本控制） | 骨架：自举生成；生成区：生成器；手写区：人/Agent |
| 代码地图 | `docs/knowledge/code-map.md` + `code-map.symbols.tsv` | 可重跑生成物 | 生成器 |
| 设计令牌 | `docs/knowledge/design-tokens.md` + `design-tokens.classes.tsv` | 可重跑生成物 | 生成器 |
| 手写知识页 | `docs/knowledge/{architecture,conventions,glossary}.md` | 长期 | **人/Agent**（自举永不创建/覆盖） |
| 知识条目 | `docs/knowledge/entries/kb-NNNN.md` | 长期 | 归档沉淀（本需求不涉及） |
| 自举结果 | 内存对象 `KbEnsureResult` | 单次调用 | 用例返回 |
| 自举去重表 | 内存 `Map<realKey, Promise<KbEnsureResult>>` | 进程级 | `KnowledgeBootstrap` |

## 自举结果对象 `serves: FR-2, FR-5`

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `status` | `'created' \| 'skipped' \| 'failed'` | 是 | `skipped` 仅两种：根未知、索引已在；`failed` 必带 `error` |
| `root` | `string` | 是 | 调用时捕获的 `docs.workspaceRoot()` 绝对值 |
| `created` | `readonly string[]` | 是 | 工作区相对路径；`skipped`/`failed` 时可为空数组 |
| `skipped` | `readonly { path, reason: 'same-content' \| 'index-exists' }[]` | 是 | 每项必有原因，禁止空原因 |
| `drift` | `readonly string[]` | 是 | 仅 `mode='check'` 非空；`write` 模式恒为 `[]` |
| `reason` | `KbEnsureReason?` | 否 | `index-exists` / `root-unknown` / `root-drifted` / `markers-missing` / `disabled` |
| `failedPath` | `string?` | 否 | `status='failed'` 时必填（定位到文件；根级失败填根路径） |
| `error` | `string?` | 否 | `status='failed'` 时必填（原文，不吞） |

**不变量**：

1. `status==='failed'` ⇒ `error` 非空且 `failedPath` 非空（失败必须可定位）。
2. `status==='created'` ⇒ `created.length > 0`（不许"成功但什么都没做"）。
3. `status==='skipped' && reason==='index-exists'` ⇒ 本次**零读源码、零写盘**（可由假端口调用计数断言）。
4. 任何情况下 `created` 与 `skipped` 的 path 集合不相交。

## 生成物文件契约 `serves: FR-3, FR-4`

| 文件（相对根） | 生成方式 | 内容锚点（机器可判） | 预算 |
|---|---|---|---|
| `docs/knowledge/INDEX.md` | 骨架 + 生成区替换 | H1 `# 项目知识索引`；八节 + 「待写」节；成对标记 `<!-- kb:generated:begin -->` / `<!-- kb:generated:end -->`（两处：前端令牌、代码地图） | ≤8000 字符、≤200 行 |
| `docs/knowledge/code-map.md` | 全生成 | 每模块一行（路径 · 角色 · 导出符号摘要） | ≤200 行 |
| `docs/knowledge/code-map.symbols.tsv` | 全生成 | 表头 `file\tname\tkind\tsignature`；**永不进上下文** | 不限（机器索引） |
| `docs/knowledge/design-tokens.md` | 全生成 | 颜色 / CSS 变量 / 断点 / `dsh-pm-*` 类名前缀分组（Top 24） | ≤200 行 |
| `docs/knowledge/design-tokens.classes.tsv` | 全生成 | 表头 `class\tshard`；**永不进上下文** | 不限 |
| `docs/knowledge/{architecture,conventions,glossary}.md` | **不生成** | —— | 人手写 |

**写入判定（逐文件）**：

```
目标内容 = 渲染(当前源码)                       # 先算后写
若 文件不存在        → 写入（生成物） / 不写（手写页）
若 内容逐字节相同    → 跳过（保 mtime，skipped.reason='same-content'）
若 内容不同且属生成物 → 覆盖写入
若 属手写页          → 永不写
若 INDEX 生成区标记缺失 → 整体 failed('markers-missing')，零写入
```

## INDEX 生成区与手写区 `serves: FR-3, FR-5`

| 区 | 标记 | 谁维护 | 自举时 |
|---|---|---|---|
| 生成区（前端令牌 / 代码地图两节） | `<!-- kb:generated:begin -->` … `<!-- kb:generated:end -->` | 生成器 | 只替换区内行，标记本身保留 |
| 手写区（项目摘要、架构、规范、决策、坑、契约、术语、待写） | 无标记 | 人/Agent | **逐字不动** |

**索引行语法**（既有单点 `domain/knowledge/index-line.ts`，本需求不改）：`- <id> · <kind> · <一句话> · → <指针>`，单行 ≤200 字符。

## 配置数据契约 `serves: FR-6`

| 字段 | 类型 | 缺省 | 校验 | 优先级 |
|---|---|---|---|---|
| `knowledge.enabled` | `boolean` | `true` | 现有判定（`!== false`） | 最高（false ⇒ 工具空集 + 不自举） |
| `knowledge.autoBootstrap` | `boolean` | `true` | **非布尔值 → 装配期抛错**（新增严格判定） | 次于 `enabled` |
| `knowledge.injectIndex` | `boolean` | `true` | 现有判定不动 | —— |
| `knowledge.injectBudgetChars` | `number` | `3000` | 现有判定不动 | —— |
| `knowledge.trimRequirementDoc` | `boolean` | `false` | 现有判定不动 | —— |

**兼容**：不写 `knowledge` 段 ⇒ 与改造前的差别只有"缺层时会长出一层"（本需求的目标行为）；已有层的项目逐字节无差别。

## 去重表与并发 `serves: FR-2, FR-5`

| 项 | 契约 |
|---|---|
| 键 | `realpath(root)` 归一（复用 `sameProjectRoot` 口径），**不是字符串原样比较**（符号链接/尾斜杠不得算两个根） |
| 值 | 进行中的 `Promise<KbEnsureResult>`（并发同根 → 共享同一 promise，用例只跑一次） |
| 失败留存 | 失败的 promise 保留在表内（`status:'failed'`），进程内不自动重试；`force:true` 才重跑 |
| 内存边界 | 表项 = 根数量（会话数量级），无淘汰策略；进程结束即释放 |
| 跨进程 | **不保证互斥**（多宿主实例可能各写一次）；因写入是"内容比对后幂等覆盖"，最坏结果是重复写同内容 |

## 删除面数据影响 `serves: FR-1`

| 项 | 结论 |
|---|---|
| 知识库页的客户端状态 | 无持久化状态（只读视图 + 30s 轮询），删除**无需迁移** |
| `/kb` 路由与 `pages[]` 字段 | 保留，响应数据契约不变 |
| 侧栏/主区插槽注册 | `pmboard-knowledge` 从注册表消失；不影响其它 panel 的 id/order |
| 台账/队列 | 零改动（本需求不写台账字段） |
