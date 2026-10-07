# 数据模型设计（REQ-261006201814-ac4f · 第二版）

> 本需求**不改任何生产数据结构**（src 零改动，D-3）。本文件定义**测试侧新增的数据契约**。
> 表头一律中文，避免与拆分内容门禁的英文列特征相撞。
> **第二版修正**：第一版 `excluded` 条数自相矛盾（6 条里含死码，又要求死码进豁免名单），此处定案。

## 契约总览 `serves: FR-1, FR-3, FR-4`

```
   tests/fixtures/error-code-inventory.json   ← 脚本生成（refresh --bootstrap），只读消费
   tests/fixtures/error-code-exempt.json      ← 人工维护（不可触发码白名单，逐条 reason）
   docs/reviews/test-baseline.reverse.txt      ← 人工维护（反向/异常路径子集）
   docs/reviews/test-baseline.other.txt        ← 人工维护（其余失败子集）
   docs/reviews/test-baseline.reverse.notes.md ← 人工维护（逐条红因，与 reverse.txt 一一对应）
```

**为什么分诊要两份独立文件**：`test-baseline.failures.txt` 会被 `baseline:refresh` **整体覆盖**；
分类信息若写在它内部，一次 refresh 就把分类冲掉。分列后 refresh 只动基线文件，
守卫能立刻发现「refresh 引入了既不在 reverse 也不在 other 的新条目」。

## error-code-inventory.json `serves: FR-1`

**职责**：冻结「什么是错误码」的口径产物。**只读**——由扫描器生成，守卫比对磁盘与它的差。

```jsonc
{
  "_note": "string：口径说明（扫描规则逐字 + 生成命令 + 假阴性口径）",
  "generatedAt": "string：ISO 8601，**已有清单时保留原值**（否则 refresh 每次重跑都写盘，幂等失效）",
  "scanRule": "string：口径可读描述（与 error-code-scan.ts 实现同源）",
  "tierRule": "string：分级口径（含首过启发式的说明）",
  "uppercase": [
    {
      "code": "string：^REQBOARD_[A-Z0-9_]+$",
      "form": "enum：产生形态，见下表",
      "site": {
        "file": "string：工作区相对路径",
        "anchor": "string：该行去首尾空白后的**磁盘原文**（抗行号漂移；**不得拼造**）"
      },
      "tier": "enum：unclassified | direct | fixture | fault",
      "covered": "boolean：是否已有断言（双形态口径）",
      "coveredHow": "enum | null：literal | const（引定义处常量）"
    }
  ],
  "lowercase": [
    {
      "code": "string：^[a-z][a-z0-9_]*$",
      "transport": "string | null：映射到的大写码（无孪生则 null）",
      "site": { "file": "string", "anchor": "string" }
    }
  ],
  "excluded": [
    { "token": "string：被排除的字样", "why": "string：为什么它不是错误码" }
  ]
}
```

**`form` 受控枚举**（第二版**扩了 1 个值**：`unclassified-form`，第一版只列 10 个而实测 93/127 落在此值）：

| form | 含义 |
|---|---|
| `reject-helper` | `reject(msg, 'REQBOARD_X')` 第二实参 |
| `throw-assign` | `throw Object.assign(new Error(…), { code })` |
| `return-code` | 领域层 `return { ok:false, code }` |
| `store-coded` | store 端口 coded() 包装 |
| `tool-receipt` | 工具回执 `{ success:false, code }` |
| `refuse-helper` | `refuse('REQBOARD_X', …)` |
| `http-fail` | `fail(res, Object.assign(…))` |
| `http-status-key` | `STATUS_BY_CODE` 里的对象键 |
| `config-assembly` | 装配期配置校验 |
| `client-error` | 客户端错误态 |
| `unclassified-form` | **首过未识别**（保守取值，不猜）；t4 逐码勘定时收紧 |

**`tier` 判定口径**：`direct` = 传非法入参或走到已存在的公开入口即可触发；
`fixture` = 需构造特定台账/文档状态；`fault` = 需故障注入；
`unclassified` = 刷新写入的临时态，**守卫要求其归零**（刷新把红变可解，不把红变绿）。

**不变量**：
- `code` 在 `uppercase` 内唯一、`lowercase` 内唯一、两集合不交。
- `excluded` **恰好 5 条**（第二版定案）：`REQBOARD_ERROR_CODES`（标识符）、`REQBOARD_XXX`（文案占位）、
  `REQBOARD_DATA_ROOT`（目录名）、`REQBOARD_SCHEMA_VERSION`（数值常量 `= 9`）、
  `REQBOARD_NO_ITEM_RESULT`（env 后缀）。
- **`REQBOARD_BRIDGE_NOT_READY` 不在 excluded**：它是**注册死码**（无产生点）但仍出现在
  `src/http/envelope.ts:93` 的状态表里 → 它是**码**（`covered=true`），归「上报的实现缺口」。
  第一版要求它同时进 excluded 与豁免名单，二者互斥（D-12）。
- `site.file` 必须真实存在；`site.anchor` 必须在 `site.file` 里**逐字出现**。
- `covered=false` 的 `uppercase` 集合与 `error-code-exempt.json` 的 `code` 全集**双向相等**。

## error-code-exempt.json `serves: FR-3`

```jsonc
{
  "_note": "string：口径（谁能进、谁必须出、棘轮纪律）",
  "frozenCount": "number：冻结条目数（棘轮上界，只减不增）",
  "entries": [
    {
      "code": "string：必须命中 inventory 的 uppercase ∪ lowercase",
      "tier": "enum：direct | fixture | fault（不得为 unclassified）",
      "reason": "string：非空、≤300 字符——为什么当前无法触发",
      "evidence": "string：形如 <工作区相对路径>:<行号>",
      "blocker": "enum：no-production-point | tool-layer-unreachable | needs-chain-setup | needs-fault-injection | other",
      "plan": "string：非空——将来怎么测"
    }
  ]
}
```

**不变量**：`entries.length ≤ frozenCount`（上调即红）；`reason`/`plan` 非空；
条目集合与 inventory 的 `covered=false` 集合**双向相等**；
`blocker=no-production-point` 只许给死码。

## test-baseline.reverse.txt / .other.txt `serves: FR-4`

**格式**：与 `test-baseline.failures.txt` **逐字同格式**（每行 `文件 :: 用例全名`，UTF-8 无 BOM）。
**必须同格式**：守卫要用集合运算对账，格式不同就得写第二套解析（本仓「两份真相」教训）。

**不变量**：`reverse ∪ other == failures`（双向）；`reverse ∩ other == ∅`；
两集合各自 count 冻结于 notes.md 表头，**只减不增**；
`failures` 出现「既不在 reverse 也不在 other」的新条目 ⇒ 红（「不许用 refresh 洗绿」的机械落点）。

## test-baseline.reverse.notes.md `serves: FR-4`

```markdown
---
reverse_count: 24
other_count: 44
---

| 用例（文件 :: 用例全名） | 红因类别 | 红线内可达性 | 证据 |
|---|---|---|---|
| tests/decompose-tools.test.ts :: …越权/不存在/人工闸门一律拒绝 | assertion-shape | 可 | 命令 + 输出摘要 |
```

**`红因类别` 受控枚举**：`src-debt`（红因是既有 src 债，红线内**不可达**，须另立需求）/
`assertion-shape` / `fixture-drift` / `order-dependent` / `unknown`（**限期清零**，计入棘轮上界）。

**不变量**：用例列集合与 `reverse.txt` 双向相等；表头计数与两份 txt 实际行数逐字一致；
`unknown` 条数只减不增。

## A/B 归因产物（FR-10） `serves: FR-10`

**职责**：把「不是本次引入」从一句声称变成可复核的集合差。

```jsonc
{
  "_note": "string：A/B 方法与同配置复跑次数",
  "subject": "string：本次改动的一句话（哪张卡、改了什么共享夹具）",
  "files": ["string：本批测试文件（工作区相对路径）"],
  "runs": {
    "withChange": ["string：失败项，格式 文件 :: 用例全名，已排序去重"],
    "withoutChange": ["string：同上"]
  },
  "repeatStability": {
    "withChangeRuns": "number：同配置复跑次数（≥2）",
    "withoutChangeRuns": "number：同上",
    "stable": "boolean：复跑之间失败集合是否逐次相同"
  },
  "introduced": ["string：withChange − withoutChange（必须为空）"],
  "fixed": ["string：withoutChange − withChange（如实列出）"]
}
```

**不变量**：`introduced` 为空才能声称无回归；`stable=false` 时必须在报告里说明
「差异属既有顺序脆弱性」，并给出同一配对复跑的证据（t2 实测：3×3 两侧逐次相同）。

## 版本与兼容 `serves: FR-9`

- **无持久数据迁移**：新增文件全是新文件，无 schema 演进。
- **兼容既有消费方**：`test-baseline.failures.txt` 与 `test-baseline.md` 的格式与语义**一字不改**，
  `pnpm baseline:check` / `--refresh` 继续按原口径工作（KB C-14）。
- **不使用 `requirement.md` front-matter 做数据契约**（避免与 `frontmatterStateViolations` 抢口径）。
- **回滚**：删除新增文件 + 还原 `vitest.config.ts` / `harness.ts` 两处改动即回到改前状态。
