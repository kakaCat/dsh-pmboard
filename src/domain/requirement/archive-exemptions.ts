/**
 * 归档清单豁免规则（REQ-261004183621-de3f t1 / design/interfaces.md「豁免常量接口」）。
 *
 * 用途：归档对账时判定「目录内哪些文件**不必**进清单」——它们由工具重建，每个需求必然一堆，
 * 混进"未列"只会把真正的漏登淹掉（实测：一次归档 88 份未列里，绝大部分是 `rtm-*.yml` 与 `queue.json`）。
 *
 * 三条硬口径：
 *   ① **不豁免人的工作记录**：`tasks/**`、`evidence/**`、`design/**`、`tests/**`、`reviews/**`
 *      与所有 `.md` 都要进清单——它们正是清单要收的东西；
 *   ② **新增机器生成物必须显式登记**：未登记就会以"未列"暴露，迫使做一次显式决定（刻意的摩擦）；
 *   ③ 本文件是**纯数据 + 纯函数**：不 import node:/@deepseek-ai/，不碰时间与随机数。
 *
 * @module dsh-pmboard/domain/requirement/archive-exemptions
 */

/** 一条豁免规则（`match` 两种形态二选一；`reason` 必填——豁免必须说得出为什么）。 */
export interface ArchiveExemptionRule {
  /** 规则 id（进对账结果与留痕，便于事后解释"为什么它不算漏"）。 */
  readonly id: string
  readonly match: {
    /** 只比**文件名**（路径末段）的通配。 */
    readonly glob?: string
    /** 路径**目录段**（不含文件名末段）匹配的通配，如 `rtm-*` 覆盖 `rtm-implementing/t-x.yml`。 */
    readonly dir?: string
  }
  readonly reason: string
}

/**
 * 豁免清单（判定顺序即数组顺序，首个命中即返回）。
 *
 * 为什么用常量而不是配置：这些是**工具重建物**的客观事实，不该让每个需求各自决定；
 * 需要例外时应当改进规则本身（并在 kb/说明书里留下认知）。
 */
export const ARCHIVE_EXEMPTIONS: readonly ArchiveExemptionRule[] = [
  {
    id: 'rtm-reports',
    match: { glob: 'rtm-*.yml' },
    reason: '追溯报告由工具重建（每个需求必然一堆）',
  },
  {
    id: 'rtm-dir',
    match: { dir: 'rtm-*' },
    reason: '同上（分任务报告目录，如 rtm-implementing/t-xxxxxx.yml）',
  },
  {
    id: 'ledger-mirror',
    match: { glob: 'queue.json' },
    reason: '台账镜像，由工具重建',
  },
  {
    id: 'runtime-state',
    match: { dir: 'state' },
    reason: '运行态留痕，由工具重建',
  },
] as const

/** 通配匹配（只支持 `*`；其余字符按字面量处理，不做正则转义陷阱）。 */
function wildcardMatch(pattern: string, text: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')
  return new RegExp('^' + escaped + '$').test(text)
}

/**
 * 判定一个**相对需求目录**的路径是否命中豁免。
 *
 * @param relPath 相对需求目录的路径（如 `rtm-implementing/t-ab12.yml`、`queue.json`、`evidence/x.txt`）
 * @returns 命中的规则（未命中 → `undefined`）
 */
export function matchArchiveExemption(relPath: string): ArchiveExemptionRule | undefined {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\.?\//, '')
  if (normalized.length === 0) return undefined
  const segments = normalized.split('/').filter((s) => s.length > 0)
  const base = segments[segments.length - 1] ?? ''
  // `dir` 规则只看**目录段**（不含末段文件名）：否则 `state/rtm-failures.json` 会被
  // `dir: 'rtm-*'` 抢走，`runtime-state` 规则就永远轮不到（实测踩到）。
  const dirs = segments.slice(0, -1)
  for (const rule of ARCHIVE_EXEMPTIONS) {
    if (rule.match.glob !== undefined && wildcardMatch(rule.match.glob, base)) return rule
    if (rule.match.dir !== undefined && dirs.some((s) => wildcardMatch(rule.match.dir!, s))) return rule
  }
  return undefined
}
