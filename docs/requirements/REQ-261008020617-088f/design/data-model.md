---
requirement_refs: [RF-1, RF-3, RF-7]
---

# 数据模型设计（REQ-261008020617-088f）

> 本需求**不改任何数据模型**。本份记三件事：既有 state 文件的契约（必须逐字不变）、
> 新引入的测试侧台账形状、以及兼容性结论。

## 台账与队列：零变更 `serves: RF-1`

不变量 `RequirementStore` / `TaskStore` 的落盘结构、字段、版本号一律未动；
本需求没有迁移脚本、没有回填、没有双写（见 `migration.md` 的「兼容期行为」）。

## state 文件契约（不变） `serves: RF-3`

`<root>/.dsh-data/state/` 下两个 JSON 的**文件名、键、顺序、缩进、条数上限**逐字不变
（只是读写路径从 application 直连 `node:fs` 改为经 `HostFsPort`）：

| 文件 | 键 | 约束 |
|---|---|---|
| `rtm-failures.json` | `requirement_id` / `trigger` / `timestamp` / `error` / `attempts` | 数组；按 `timestamp` 降序只保留最近 **100** 条；JSON 缩进 **2 空格** |
| `rtm-trigger-traces.json` | `requirement_id` / `trigger` / `paths` / `timestamp` | 同上（`paths` 原样记录，不归一/去重） |

**一处申报的实现细节变更**（不是模型变更）：`rtm-failures.json` 的写由「写临时文件 + 复制」
统一为「按需建目录 + 原子 rename」，且 `finally` 里原先的 `require('fs')`（ESM 下必抛 ⇒ 残留 `.tmp-*`）
换成适配器里 import 的 `unlinkSync`。差异只落在两条边：① state 目录不存在时改前抛错（被吞、证据丢）、改后正常落盘；
② 改前残留临时文件、改后不留。键/文件名/缩进/条数上限一律不变，并新增用例钉住。

## 层门豁免台账（新，测试侧数据） `serves: RF-7`

`tests/fixtures/layer-boundary-exempt.json`（**不进运行时数据面**，只是门禁的输入）：

```jsonc
{
  "_note": "准入/清出/棘轮口径……",
  "frozenCount": 0,                    // 必须 === entries.length，且 ≤ 测试内硬上界 EXEMPT_CEILING
  "entries": [                          // 本次为空数组：15 处越界全部真修
    { "file": "…", "import": "…", "reason": "…", "plan": "…" }   // reason/plan 各 ≥ 20 字
  ]
}
```

`file` 是工作区相对路径、`import` 是模块说明符**原文**（逐字相等才认，不做前缀匹配——
前缀会让一条豁免吞掉一片）。四条判据见 `test-cases.md`。

## 兼容性分析 `serves: RF-1`

| 变更项 | 旧行为 | 新行为 | 迁移 |
|---|---|---|---|
| `rtm-failures.json` 写入方式 | 临时文件 + 复制（不建目录） | 按需建目录 + rename | 无需迁移（文件格式不变，旧文件照读） |
| `UseCaseDeps.hostFs` | 不存在 | 必填端口 | 装配点补齐即可（编译期兜底，5+1 处） |
| 三份门模块路径 | `gate/{design,acceptance,task-coverage}-gate.ts` | `gate/rtm-gates.ts`（barrel 名称不变） | 调用方只需改 import 路径（全仓仅 3 份单测 + barrel） |
