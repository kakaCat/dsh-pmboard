---
req_id: REQ-261003204143-3219
serves: FR-1, FR-2, FR-3
---

# 拆分计划：reqboard_capture 回执契约修复

> 类型：bug（三卡制：复现 → 修复 → 回归）｜ 依据：design/design.md（已确认）。
> 粒度原则：修复卡只做设计与需求文档里写明的改动，不夹带任何顺手清理。

## 目标

让 reqboard_capture 任意分支回执通过自己声明的 output.schema（违例 = 0），
并把 `answers` 五键收敛为一处共享常量，使"新增问项漏改 schema"在未来当场红。

## 改动盘点

| 文件 | 动作 | 内容 |
|---|---|---|
| `src/tools/CaptureTool/CaptureTool.ts` | 修改 | `answers.properties` 改由共享常量生成（保留 `workspace` 声明与其注释锚点——该修复已在工作区，本需求只核对不重写） |
| `src/application/internal/capture-mapping.ts` | 修改 | 新增导出 `CAPTURE_ANSWER_KEYS`；`CaptureMapping.answers` 类型由其派生 |
| `tests/capture-output-contract.test.ts` | 新增（已落盘） | 成功/取消两路径回执过 schema；t3 内补键集同源断言 |
| 删除 | 无 | — |

## 任务表

| key | 标题 | phase | side | depends_on |
|---|---|---|---|---|
| t1 | 验证契约用例能抓住漂移（复现卡） | analysis | backend | — |
| t2 | 落地 answers 键共享常量并核对 schema 声明（修复卡） | implement | backend | t1 |
| t3 | 全量回归与反向演练证据（回归测试卡） | test | backend | t2 |

## 各卡验收（可证伪）

- **t1**：临时从 `CaptureTool.ts` schema 摘 `workspace` 声明 →
  `npx vitest run tests/capture-output-contract.test.ts` 红且违例点名 `answers.workspace`；
  恢复后同命令绿。证据：两次运行的输出摘要（红→绿）。
- **t2**：`CAPTURE_ANSWER_KEYS` 在 `capture-mapping.ts` 导出且 `CaptureMapping.answers` 类型由其派生；
  `CaptureTool.ts` 不再手写 answers 五行（grep `Object.fromEntries` 或等价生成式锚点）；
  `npx tsc --noEmit` 通过；反向演练②：从常量摘一键 → tsc 报错或用例红并点名。
- **t3**：`npx vitest run tests/capture-output-contract.test.ts tests/capture-tool.test.ts tests/tools-schema.test.ts tests/capture.test.ts tests/capture-hook.test.ts` 五文件全绿；
  键集断言（mapCaptureAnswers 键集 === 常量 === schema properties 键集）在用例内可点名。

## 边界（不做）

- 不碰 SubmitTool.auto_confirm / RESPONSE_SOURCES 三工具映射（并行窗口 REQ-261003204149-1e80 在制）。
- 不扩 output-contract 静态扫描面到嵌套对象（共享常量 + 动态用例已覆盖该缺口）。
- 不改弹框五问的题目与取值逻辑。
