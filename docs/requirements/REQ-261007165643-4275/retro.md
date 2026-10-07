---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 复盘（REQ-261007165643-4275 reqboard 插件工具面体检）

> spike 复盘：本次调研的方法、结论可信度、踩坑与对插件自身的反哺。

## 结论回顾 <!-- serves: FR-4 -->

- 交付物：[design/research-report.md](../design/research-report.md)（三路并行只读审查，证据全部附文件:行号）。
- 核心结论：主流程健康；问题集中在边界路径（3 高危）与工具面治理（27→21/19、136 错误码、文案漂移）。
- 沉淀入口：[docs/strategy-research/reqboard-plugin-audit-2026-10-07.md](../../../strategy-research/reqboard-plugin-audit-2026-10-07.md)。

## 方法有效性 <!-- serves: FR-1 -->

- **三路并行子代理分工（工具面 / 状态机并发 / 文案契约）有效**：互不重叠、各带证据标准，汇总无冲突。
- **父窗口抽检机制有效**：两路报告抽检 11 处引用全部属实，无伪造证据。
- **口径双跑有必要**：错误码 136 vs 139、prompt 字符 14,835 vs 21,588 两组读数差均来自统计口径，
  报告内显式注记后才可复核——教训：**任何数字结论必须附采集命令**。

## 踩坑记录（对插件自身的反哺） <!-- serves: FR-2 -->

| 坑 | 经过 | 反哺 |
|----|------|------|
| 验收覆盖门禁不扫 .txt | tests/self-check.txt 的 covers 标注不生效，门禁仍报 0%；改 .md 即过 | 门禁报错文案只说「用 covers: t-xxx 标注」，不提文件扩展名约束——可改进报错指引 |
| AC-7.5 九类文档对 spike 过重 | spike 零代码改动仍要求 architecture/data-model/interfaces/test-cases + reviews + tests | 四份文档以「不适用+理由」形式补齐是可行的，但流程成本不低；可考虑 spike 档的豁免声明机制 |
| 归档规范指针是死链 | prompt 指向的 requirement-archive.md 不存在（本调研 C-3 已记录） | 活证据：归档时 agent 真会去读它 |

## 被证伪的假设 <!-- serves: FR-3 -->

- 假设「28 个工具目录」：实测 27（registry.ts / package.json / README / src/index.ts 四方一致）。
- 假设「工具面重复是最大问题」：实测完全冗余仅 1 个（task_execute）；
  更大的问题是**文案契约漂移**（C-1~C-6）与**边界路径 bug**（H1~H3）。

## 后续行动 <!-- serves: FR-4 -->

- 待裁决项三条（是否立项整治 / 保守或激进精简 / 单进程假设）已在 requirement.md「待答问题」与
  strategy-research 沉淀篇双留痕，由人裁决后另立需求。
