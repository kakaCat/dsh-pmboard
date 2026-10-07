/**
 * 需求文档位置（工作区相对）——**唯一解析点**。
 *
 * 治什么（2026-10-06 用户现场）：会话右上角流程面板的「📂 文档位置」写死拼
 * `docs/requirements/<id>/`，而用户在**立项四问**里选的文档位置（台账 `docBasePath`）
 * 根本不参与渲染——换过位置的需求（`docs/rfcs/` 等）面板显示的是另一个目录。
 * 同一批写死拼法在 host 侧还有十几处（查询 / 门禁 / 落盘），于是「文件生成在哪」
 * 与「面板/文档页说在哪」可以各说各话。
 *
 * 口径（沿用 REQ-260922012924-2e29 FR-2 已冻结的契约，**不新造第二套**）：
 *   ① `docLinks.requirement` 显式链接优先（最高）；
 *   ② `docBasePath` 里 `<REQ>` 占位符全部替换为需求 id；
 *   ③ `docBasePath` **无** `<REQ>` 时追加 `<id>/` 子目录（防多需求撞同一 requirement.md）；
 *   ④ 尾部斜杠归一；⑤ 文件名恒 `requirement.md`；⑥ 无 `docBasePath` → 缺省
 *      `docs/requirements/<REQ>/`（与改造前逐字节一致）。
 *
 * 为什么放在 domain：host（查询 / 门禁 / 落盘）与 client（面板显示、绝对化）都要用同一个
 * 口径；各自再写一份拼法就等于两套真相——本仓已经吃过这个亏。纯字符串层：不碰 I/O、
 * 不读时间与随机数（INV-2 层边界）。
 *
 * @module dsh-pmboard/domain/requirement/DocLocation
 */

/** 解析所需的最小输入面（`RequirementRecord` 结构上满足它，测试也可只给这两个字段）。 */
export interface DocLocationInput {
  id: string
  /** 立项四问里的「需求文档位置」（台账字段）；缺省 = 老记录 / 未选。 */
  docBasePath?: string
  /** 显式链接优先（人工改过位置的老记录走这条）。 */
  docLinks?: { requirement?: string }
}

/** 缺省文档位置（与 `CAPTURE_DEFAULTS.docLocation` 同值：立项弹框「推荐」项）。 */
export const DEFAULT_DOC_BASE_PATH = 'docs/requirements/<REQ>/'

/**
 * 需求文档**文件**的工作区相对路径（缺省 `docs/requirements/<id>/requirement.md`）。
 *
 * `requirement === undefined` → 空串（调用方按"拿不到"处理，不编路径）。
 */
export function requirementDocPathOf(requirement: DocLocationInput | undefined): string {
  if (requirement === undefined) return ''
  const explicit = requirement.docLinks?.requirement
  if (explicit !== undefined && explicit.length > 0) return explicit
  const raw = requirement.docBasePath ?? DEFAULT_DOC_BASE_PATH
  const hasPlaceholder = raw.includes('<REQ>')
  const base = raw.replaceAll('<REQ>', requirement.id)
  const withId = hasPlaceholder ? base : base.replace(/\/?$/, '/') + requirement.id + '/'
  return withId.replace(/\/?$/, '/') + 'requirement.md'
}

/**
 * 需求文档**目录**的工作区相对路径（无尾斜杠，如 `docs/requirements/REQ-x`）。
 *
 * 目录与文件同源（由 {@link requirementDocPathOf} 取父目录）：两者若各拼一次，
 * 「面板说的目录」与「实际落盘的文件」迟早分叉——这正是本次要修的缺陷。
 * 拿不到（undefined）→ 空串。
 */
export function requirementDocDirOf(requirement: DocLocationInput | undefined): string {
  const p = requirementDocPathOf(requirement)
  if (p.length === 0) return ''
  const i = p.lastIndexOf('/')
  return i <= 0 ? (i === 0 ? '' : p) : p.slice(0, i)
}
