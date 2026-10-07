/**
 * 夹具根的**契约锚点**（REQ-261006201814-ac4f FR-5⑤-b）。
 *
 * ## 它守的是哪条契约
 *
 * 生产侧 `ensureWritableProjectRoot`（`src/application/internal/support.ts:516-546`）会拿
 * **记录声明的项目根**去调 `docs.exists(declared)` 核验。于是 docs 替身必须遵守与生产同一条契约：
 *   ① `workspaceRoot()` 是**绝对路径**；
 *   ② 「根下的绝对路径」与「对应的相对路径」**等价**（替身不能只认相对键）；
 *   ③ **根自身算存在的目录**（`exists(workspaceRoot)` 为真，否则核验必拒）。
 *
 * ## 为什么这三条必须被钉住（血的教训）
 *
 * 第一版把 `FakeDocs.workspaceRoot()` 从 `'.'` 改成绝对临时根——**只改了那一行**。
 * 结果 A/B 实测打红 **10 条**立项/捕获用例：绝对根走进核验，而替身只认相对键 →
 * `REQBOARD_INVALID_WORKSPACE`。改前之所以不红，是因为 `'.'` 是非绝对路径，
 * 走的是「**不判**」的宽容旁路——**不红不是因为它对，而是因为那一关根本没走**。
 *
 * 故本模块把「绝对根 + 路径等价 + 根存在」三条写成可失败的断言：
 * 谁把根改回相对路径、谁写一个新的只认相对键的替身，这里先亮。
 *
 * @module dsh-pmboard/tests/setup/hermetic-contract
 */
import { isAbsolute, join } from 'node:path'
import { FakeDocs } from '../application/harness.js'
import { isUnderTempDir, resolveWorkspaceRoot } from '../helpers/workspace-root.js'

/** 契约违反（人读：哪一条、实际值是什么）。 */
export interface ContractViolation {
  readonly what: string
  readonly detail: string
}

/** 契约用探针路径（相对形态；绝对形态由被测替身自己按根拼）。 */
const PROBE_REL = 'docs/requirements/REQ-contract-probe/probe.md'

/**
 * 检查一个 docs 替身是否满足三条契约。
 *
 * 抽成「接收替身」而不是硬编码 `FakeDocs`：这样**判据自身也能被反证**——
 * 传一个故意坏掉的替身进去，必须返回非空 violations，否则本判据是空转的。
 */
export function checkDocDoubleContract(
  docs: { workspaceRoot: () => string; exists: (p: string) => boolean; put?: (p: string, c?: string) => void },
  label = 'docs 替身',
): readonly ContractViolation[] {
  const out: ContractViolation[] = []
  const root = docs.workspaceRoot()

  if (!isAbsolute(root)) {
    out.push({
      what: label + '.workspaceRoot() 不是绝对路径',
      detail: '实际 = ' + root + '（相对路径会落到 process.cwd()，即真实工作树）',
    })
  } else if (!isUnderTempDir(root)) {
    out.push({
      what: label + '.workspaceRoot() 不在系统临时目录下',
      detail: '实际 = ' + root + '（落在仓库内 = 测试会写真实工作树）',
    })
  }

  // ② 绝对路径 ≡ 相对路径（替身只认相对键时，这里必红）
  docs.put?.(PROBE_REL, 'x')
  const abs = join(root, PROBE_REL)
  if (!docs.exists(PROBE_REL)) {
    out.push({
      what: label + '.exists(相对路径) 为假',
      detail: PROBE_REL + '（替身连相对键都查不到，探针没写进去？）',
    })
  }
  if (!docs.exists(abs)) {
    out.push({
      what: label + '.exists(根下绝对路径) 为假',
      detail: abs + '（生产核验传的就是绝对根/绝对路径，只认相对键的替身必被 REQBOARD_INVALID_WORKSPACE 拒）',
    })
  }

  // ③ 根自身算存在的目录
  if (!docs.exists(root)) {
    out.push({
      what: label + '.exists(workspaceRoot()) 为假',
      detail: root + '（ensureWritableProjectRoot 会拿声明的根来核验，根必须算存在）',
    })
  }

  return out
}

/**
 * 断言**真实夹具**满足契约；不满足则抛 `TEST_HERMETIC_CONTRACT`。
 *
 * 顺带跑一次自检：用一个故意返回 `'.'` 的替身验证判据**不是空转**（否则整条契约是一句空话）。
 */
export function assertDocDoubleContract(): void {
  const violations = [...checkDocDoubleContract(new FakeDocs(() => 0), 'FakeDocs')]

  // ⑤-b 的解析兜底（tool-deps 侧）同样必须在临时根
  const resolved = resolveWorkspaceRoot()
  if (!isUnderTempDir(resolved)) {
    violations.push({
      what: 'resolveWorkspaceRoot() 不在系统临时目录下',
      detail: '实际 = ' + resolved,
    })
  }

  const bad: ContractViolation[] = [...checkDocDoubleContract(
    { workspaceRoot: () => '.', exists: () => false },
    '故意坏掉的替身',
  )]
  if (bad.length === 0) {
    violations.push({
      what: '契约判据自身空转',
      detail: '对一个绝对不满足契约的替身（根为 . 且 exists 恒假）竟然没报违反——判据失效',
    })
  }

  if (violations.length > 0) {
    const detail = violations.map(v => '  · ' + v.what + ' → ' + v.detail).join('\n')
    throw Object.assign(
      new Error(
        '夹具根契约被破坏（TEST_HERMETIC_CONTRACT）：\n' + detail
        + '\n补齐：docs 替身的 workspaceRoot() 必须是绝对临时根，且「根下绝对路径 ≡ 相对路径」、'
        + '「根自身算存在的目录」。把根改回 \'.\' 会让立项/捕获用例整片变红（A/B 实测 10 条）。',
      ),
      { code: 'TEST_HERMETIC_CONTRACT' },
    )
  }
}
