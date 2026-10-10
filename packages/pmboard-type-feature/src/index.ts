/**
 * `pmboard-type-feature` —— feature 类需求的**类型规格**（L0.5，依赖 type-kit + common）。
 *
 * 规格值**逐行搬运**自现网单一源（REQ-261009174713-7bc8 t-3ea341）：
 *   · 必填节 delta / 必交设计文档 / 条件设计文档 / 条件阶段产物 ← `application/internal/category-doc-sets.ts` 的 CATEGORY_DELTAS
 *   · 模板地址 ← `domain/template/registry.ts` 的 NODE_TEMPLATES（按 category 过滤）
 *   · 归档去向与说明书 ← `domain/artifact/ArtifactSpec.ts` 的 ARCHIVE_DOC_RULES
 *   · 中文标签 ← `application/internal/capture-mapping.ts` 的 CATEGORY_ZH
 *
 * 本包只装**声明式数据 + 纯校验**：不读盘、不渲染、不做 I/O（模板实体在 pmboard-templates 资产包）。
 * 迁移期（本卡落地、core 收口卡之前）现网那几处仍是同一批值的旧落点，两边逐字一致由六类型
 * 规格快照用例（t-960cb2）钉住——收口时删旧落点、只留本包。
 *
 * @module pmboard-type-feature
 */
import type { RequirementTypeSpec } from 'pmboard-type-kit'

/** feature 的类型规格（声明式；消费方只经 pmboard-type-kit 的注册表读它）。 */
export const spec: RequirementTypeSpec = {
  "category": "feature",
  "label": "功能（新增能力）",
  "rootSectionsDelta": [
    "产品定义",
    "用户与角色",
    "功能点"
  ],
  "requiredDesignDocs": [
    "architecture.md",
    "data-model.md",
    "interfaces.md",
    "test-cases.md",
    "use-cases.md"
  ],
  "conditionalDesignDocs": [
    {
      "name": "frontend.md",
      "side": "frontend"
    },
    {
      "name": "backend.md",
      "side": "backend"
    }
  ],
  "conditionalStageArtifacts": [
    {
      "stage": "brainstorming",
      "kind": "prototype",
      "side": "frontend"
    }
  ],
  "templates": [
    {
      "stage": "brainstorming",
      "requirement": {
        "relPath": "brainstorming/feature.md"
      },
      "prototype": {
        "relPath": "brainstorming/prototype.html",
        "description": "原型骨架（UI 需求）"
      }
    },
    {
      "stage": "design",
      "designDocs": [
        {
          "relPath": "design/architecture.md",
          "description": "架构设计"
        },
        {
          "relPath": "design/data-model.md",
          "description": "数据模型"
        },
        {
          "relPath": "design/interfaces.md",
          "description": "接口设计"
        },
        {
          "relPath": "design/test-cases.md",
          "description": "测试用例"
        },
        {
          "relPath": "design/use-cases.md",
          "description": "用例设计"
        }
      ]
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
  "docQuality": {
    "failureSection": true
  },
  "archive": {
    "requireManual": true,
    "requiredDocs": [
      "requirement",
      "plan",
      "verification"
    ],
    "mergeTargets": [
      "agent-dh/docs/architecture/",
      "agent-dh/docs/guides/",
      "docs/architecture/",
      "docs/guides/"
    ],
    "note": "功能：能力/接口变了 → 必须更新架构或使用指南（否则新人只能读代码）"
  }
}
