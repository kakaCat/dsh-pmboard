/**
 * `pm-category-spike` —— spike 类需求的**类型规格**（L0.5，依赖 type-kit + common）。
 *
 * 规格值**逐行搬运**自现网单一源（REQ-261009174713-7bc8 t-3ea341）：
 *   · 必填节 delta / 必交设计文档 / 条件设计文档 / 条件阶段产物 ← `application/internal/category-doc-sets.ts` 的 CATEGORY_DELTAS
 *   · 模板地址 ← `domain/template/registry.ts` 的 NODE_TEMPLATES（按 category 过滤）
 *   · 归档去向与说明书 ← `domain/artifact/ArtifactSpec.ts` 的 ARCHIVE_DOC_RULES
 *   · 中文标签 ← `application/internal/capture-mapping.ts` 的 CATEGORY_ZH
 *
 * 本包只装**声明式数据 + 纯校验**：不读盘、不渲染、不做 I/O（模板实体在 pm-templates 资产包）。
 * 迁移期（本卡落地、core 收口卡之前）现网那几处仍是同一批值的旧落点，两边逐字一致由六类型
 * 规格快照用例（t-960cb2）钉住——收口时删旧落点、只留本包。
 *
 * @module pm-category-spike
 */
import type { RequirementTypeSpec } from 'pm-category-kit'

/** spike 的类型规格（声明式；消费方只经 pm-category-kit 的注册表读它）。 */
export const spec: RequirementTypeSpec = {
  "category": "spike",
  "label": "调研（产出是结论，不是留下的代码）",
  "rootSectionsDelta": [
    "待答问题",
    "结论"
  ],
  "requiredDesignDocs": [],
  "templates": [
    {
      "stage": "brainstorming",
      "requirement": {
        "relPath": "brainstorming/spike.md"
      }
    },
    {
      "stage": "decomposing",
      "decomposition": {
        "relPath": "decomposing/decomposition.md"
      }
    },
    {
      "stage": "implementing",
      "taskCard": {
        "relPath": "implementing/task-card.md"
      },
      "testEvidence": {
        "relPath": "implementing/test-evidence.md"
      },
      "review": {
        "relPath": "implementing/review.md"
      }
    },
    {
      "stage": "accepting",
      "verification": {
        "relPath": "accepting/verification.md"
      }
    },
    {
      "stage": "archived",
      "archiveIndex": {
        "relPath": "archived/index.md"
      },
      "retro": {
        "relPath": "archived/retro.md"
      }
    }
  ],
  "archive": {
    "requireManual": true,
    "requiredDocs": [
      "requirement",
      "retro"
    ],
    "mergeTargets": [
      "docs/rfcs/",
      "agent-dh/docs/rfcs/",
      "docs/architecture/",
      "agent-dh/docs/architecture/",
      "docs/strategy-research/"
    ],
    "note": "调研：产物是结论（含被证伪的假设）——成提案进 rfcs/，成认知进 architecture/，策略类进 strategy-research/"
  }
}
