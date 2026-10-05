# REQ-261002110908-81d0 测试用例设计 · 文案契约与覆盖守护 `serves: FR-1, FR-2, FR-3`

> 全部为**单元测试**（无 E2E 必需项：本需求不产生运行时行为变化）。
> 反向用例与正向用例同等重要：**删掉约定必须变红**，否则这条约定只是装饰。

## 用例清单 `serves: FR-1, FR-2, FR-3`

| 编号 | 层级 | 覆盖 | 命令 | 期望 |
|---|---|---|---|---|
| TC-1 | 单元 | FR-1 | `npx vitest run tests/arg-guidance.test.ts -t 三锚点` | `TASK_REPORT_PROMPT` 命中三锚点（短句上限 / `「」` / 拆多次）；`completed` 参数 `description` 亦命中 |
| TC-2 | 单元 | FR-2 | `npx vitest run tests/arg-guidance.test.ts -t 覆盖` | 遍历 `LONG_TEXT_FIELDS` x 工具定义：每个字段描述都含约定短语；失败时输出**缺项名单** |
| TC-3 | 反向 | FR-1 | 同上文件（负例分支） | 用临时改写的描述文本喂断言函数 → 必须报缺（证明断言不是恒真） |
| TC-4 | 反向 | FR-2 | 同上文件（负例分支） | 造一个未接约定的长文本字段 → 覆盖断言必须红（证明新增字段会被拦住） |
| TC-5 | 集成（脚本） | FR-3 | `node scripts/check-prompt-fragments.mjs` | 退出码 0（片段与生成产物一致）；反向：手工改产物 → 非零退出 |

## 用例实现口径 `serves: FR-1, FR-2`

- 断言函数的**唯一入口**放测试文件内（或被测模块导出），签名形如
  `assertNoteAnchors(description: string): string[]`（返回缺失锚点列表，空数组 = 通过）——TC-3 直接喂假文本即可证伪。
- 工具定义取法沿用既有先例 `tests/ask-confirm-prompt.test.ts`：`define*Tool({} as never)` 后读
  `tool.parameters?.properties?.<field>?.description` 与 `tool.description`。
- 用例文件头按本仓纪律声明 `// serves: FR-1, FR-2`。

## FR ↔ TC 覆盖映射 `serves: FR-1, FR-2, FR-3`

| 功能点 | 覆盖用例 |
|---|---|
| FR-1 | TC-1、TC-3 |
| FR-2 | TC-2、TC-4 |
| FR-3 | TC-5 |

> 无未覆盖条款：三条 FR 都有落点。

## 基线与回归命令 `serves: FR-1, FR-2, FR-3`

| 目的 | 命令 | 期望（规范） |
|---|---|---|
| 新增用例 | `npx vitest run tests/arg-guidance.test.ts` | 全绿（含两条反向证伪） |
| 回归比对 | `npx vitest run` | 失败数与开工前基线**持平**（C-14） |
| 类型检查 | `npx tsc --noEmit` | 无新增错误（C-15） |
| 片段一致性 | `node scripts/inline-prompt-fragments.mjs` + `node scripts/check-prompt-fragments.mjs` | 退出码 0（C-16 / C-17） |
| 知识层 | `pnpm kb:check` | 退出码 0（C-13，仅当本轮改到知识层时） |
| 构建 | `pnpm build` | 退出码 0，`dist/` 与 `lib/client.js` 有新产物（C-11） |
