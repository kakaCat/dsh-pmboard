/**
 * `pm-type-bug` —— bug 类需求的**类型规格**（L0.5，依赖 type-kit + common）。
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
 * @module pm-type-bug
 */
import type { RequirementTypeSpec } from 'pm-type-kit'

/** bug 的类型规格（声明式；消费方只经 pm-type-kit 的注册表读它）。 */
export const spec: RequirementTypeSpec = {
  "category": "bug",
  "label": "缺陷（修复线上/代码问题）",
  "rootSectionsDelta": [
    "复现步骤",
    "根因",
    "回归"
  ],
  "requiredDesignDocs": [],
  "templates": [
    {
      "stage": "brainstorming",
      "requirement": {
        "relPath": "brainstorming/bug.md"
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
    "requireManual": false,
    "requiredDocs": [
      "requirement",
      "verification",
      "retro"
    ],
    "mergeTargets": [
      "agent-dh/docs/guides/",
      "agent-dh/docs/architecture/",
      "docs/guides/",
      "docs/architecture/"
    ],
    "note": "缺陷：根因与防回归写进 guides/（故障排查手册）或 architecture/（机制性根因）——规范没有单独的 known-issues 目录，别自创平行体系"
  }
}
