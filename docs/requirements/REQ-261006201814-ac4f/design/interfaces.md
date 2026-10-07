# 接口设计（REQ-261006201814-ac4f · 第二版）

> 定死**测试侧新增接口的签名与错误语义**。全部接口在 `tests/`（+ `vitest.config.ts`），不改 `src/`（D-3）。
> **第二版修正**：第一版把「改写 fs 导出」写成接口，实测不可能，已删除并替换为权限模型启动契约。

## 命名与错误语义总则 `serves: FR-1, FR-9`

1. **测试侧自造的错误码一律不带 `REQBOARD_` 前缀**（用 `TEST_` 前缀）——否则会被 FR-1 的扫描器
   当成生产码，污染 R6 读数。
2. **失败消息走统一信封**：`<what> —— <why>。补齐：<how>`；`<how>` 必须是**可复制执行的命令**
   或具体到文件行的动作（FR-9③：报红必给自助路径）。
3. **幂等**：刷新型接口重复调用结果一致；扫描型接口零写盘。
4. **零写盘**：除 `refresh-*`、`triage-*` 与 drill 三类入口外，任何接口不得写工作树。

## tests/helpers/error-code-scan.ts `serves: FR-1`

```ts
export interface CodeSite { readonly file: string; readonly anchor: string }
export interface UpperHit { readonly code: string; readonly form: CodeForm; readonly site: CodeSite }
export interface LowerHit { readonly code: string; readonly transport: string | null; readonly site: CodeSite }
export interface ExcludedToken { readonly token: string; readonly why: string }
export interface ScanResult {
  readonly uppercase: readonly UpperHit[]
  readonly lowercase: readonly LowerHit[]
  readonly excluded: readonly ExcludedToken[]
}

/** 扫描 src。@throws TEST_SCAN_ROOT_MISSING（根不存在）——绝不把「扫不到」当成「没有码」。 */
export function scanErrorCodes(srcRoot?: string): ScanResult

/** 常量别名表：`JOURNAL_ERROR.COUNT_EXCEEDS_LINES` → `REQBOARD_JOURNAL_COUNT_EXCEEDS_LINES`。 */
export function collectConstAliases(srcRoot?: string): ReadonlyMap<string, string>

/** 测试侧覆盖实况（双形态）。同码既有字面量又有常量时取 'literal'。 */
export function collectTestCoverage(testsRoot?: string): ReadonlyMap<string, 'literal' | 'const'>

/** 小写码（只认两张登记表：REQBOARD_ERROR_CODES 与 TRANSPORT_CODE_BY_INTERNAL）。 */
export function collectLowercaseCodes(srcRoot?: string): LowerHit[]
```

**实现纪律（第二版新增，都是踩过的坑）**：
- **`anchor` 必须取自磁盘原文，不得拼造**：早先按 `key: 'value'` 拼 anchor，
  而 `errors.ts` 实际是 `invalidDecomposed: 'invalid_decomposed'`（键驼峰、值下划线）→
  守卫一上线就把自己判红。
- **取对象字面量正文必须截断**：`slice(marker)` 到文件尾会把别处的 `{ code: 'REQBOARD_X' }`
  吃进映射表（实测多出一个伪造的小写码 `code`）。实现用「首个顶格 `}`」截断。

## tests/helpers/code-trigger-harness.ts `serves: FR-2, FR-3`

```ts
export interface TriggerObservation { readonly code: string | undefined; readonly note?: string }
export interface TriggerSpec {
  readonly code: string
  readonly tier: 'direct' | 'fixture' | 'fault'
  readonly trigger: () => Promise<TriggerObservation> | TriggerObservation
}

/** 展开成参数化用例并逐条断言「触发 → 断码」。 */
export function defineCodeTriggers(specs: readonly TriggerSpec[]): void

/** 统一取码：err.code → result.code → result.error.code → 消息里的 (REQBOARD_...) 文本。 */
export function codeOf(errOrResult: unknown): string | undefined
```

**三条自检**（防假绿）：`specs` 非空；每个 `spec.code` 命中 inventory；同码不得重复超过一次。

## tests/helpers/workspace-root.ts `serves: FR-5`

```ts
export const REPO_ROOT: string
export function testWorkspaceRoot(): string            // 进程级 mkdtemp（惰性）
export function perFileWorkspaceRoot(importerUrl: string): string   // 每文件一份
export function resolveWorkspaceRoot(explicit?: string): string     // 语义与改前逐字一致
export function isUnderTempDir(p: string): boolean     // realpath 后比较，避开 macOS 软链
```

**兼容要求**：`resolveWorkspaceRoot` 函数体与改前**逐字等价**（仅签名放宽为可选）——已核对。

## tests/application/harness.ts 的 FakeDocs 契约 `serves: FR-5`

**这是第二版最关键的修正**：`workspaceRoot()` 从 `'.'` 改为绝对临时根，**必须同时**让替身认绝对路径。

```ts
export class FakeDocs implements DocRepository {
  constructor(now?: () => number, root?: string)   // root 缺省 = testWorkspaceRoot()
  /** 把「可能是绝对路径」的入参归一为相对键：根下绝对路径 ≡ 相对路径；根自身 → ''。 */
  private keyOf(p: string): string
  exists(relPath: string): boolean   // 根自身（非空入参）恒为 true——生产 exists(workspaceRoot) 为真
  read/write/list/stat               // 全部经 keyOf 归一
  resolve(relPath: string): string   // 保持 identity（既有语义，不动）
  workspaceRoot(): string            // 绝对临时根
}
```

**为什么必须这样**：`ensureWritableProjectRoot`（`src/application/internal/support.ts:541-546`）会拿
「记录声明的根」调 `docs.exists(declared)`。改前 `'.'` 是非绝对路径，走的是第 ① 步
**「非绝对 → 不判」的宽容旁路**——不红不是因为它正确，而是因为那一关根本没走。
换成绝对根后第 ② 步开始生效，相对键替身必然查不到 → `REQBOARD_INVALID_WORKSPACE`。
**A/B 实测：首版改动打红 10 条立项/捕获用例；补上 `keyOf` 后清零。**

## 隔离层接口（三层） `serves: FR-5`

### ⑤-a 权限模型（vitest worker 启动契约，非函数） `serves: FR-5`

```jsonc
// vitest.config.ts
{
  "test": {
    "setupFiles": ["tests/setup/hermetic-guard.ts"],
    "poolOptions": {
      "forks": {
        "execArgv": [
          "--permission",
          "--allow-fs-read=*",
          "--allow-fs-write=/tmp",
          "--allow-fs-write=/private/tmp"
        ]
      }
    }
  }
}
```

**契约与判据**：
- 仓内写入 → `ERR_ACCESS_DENIED`（**实测**：写 `/tmp` 允许、写仓内路径被拒、仓内零残留）。
- **Node 25 不接受逗号分隔**的 `--allow-fs-write=a,b`（告警 + 按无效处理）→ 必须**重复 flag**。
- **Node 20** 上开关名为 `--experimental-permission` → 设计给出**运行时探测 + 降级路径**：
  不支持时跳过 ⑤-a 并在报告里**如实标注未执行**（不得静默当成通过）。
- 启动自检（setupFiles 内）：探测「权限模型是否真的生效」——尝试写一个仓内探针路径，
  **若没被拒绝**则说明 ⑤-a 未生效，打印响亮警告并把该次运行标记为「⑤-a 未覆盖」。

### ⑤-b 契约锚点守卫 `serves: FR-5`

```ts
export function installHermeticGuard(): void
export function assertDocDoblesHaveAbsoluteRoot(): { violations: readonly string[] }
export function guardViolations(): readonly { what: string; detail: string }[]
```

**判据**：所有 docs 替身的 `workspaceRoot()` 必须是**绝对路径**且落在系统临时目录下；
且「根下绝对路径」必须等价于「相对路径」（用 `exists`/`read` 各探一次）。
违反 → 抛 `TEST_HERMETIC_CONTRACT`，消息给出「改回 `'.'` 会让哪些用例变红」的提示。

## tests/helpers/ab-attribution.ts `serves: FR-10`

```ts
export interface AbInput {
  readonly subject: string            // 哪张卡、改了什么共享夹具
  readonly files: readonly string[]   // 本批测试文件（工作区相对路径）
  readonly mutate: () => void         // 把改动「回退」到改前形态
  readonly restore: () => void        // 逐字节还原（必须幂等）
  readonly repeat?: number            // 同配置复跑次数，缺省 2
}
export interface AbResult {
  readonly withChange: readonly string[]     // 失败集合（已排序去重）
  readonly withoutChange: readonly string[]
  readonly introduced: readonly string[]     // withChange − withoutChange，**必须为空**
  readonly fixed: readonly string[]          // withoutChange − withChange
  readonly stable: boolean                   // 复跑之间集合是否逐次相同
}
export async function runAbAttribution(input: AbInput): Promise<AbResult>
```

**纪律**：`restore()` 必须是**逐字节**还原（备份 + sha256 复核），**禁用按路径检出还原**
（2026-10-04 事故：误用检出还原回退了多个窗口的未提交改动）。

## 自助修复命令（FR-9③） `serves: FR-9`

| 红在哪 | 自助命令 | 语义 |
|---|---|---|
| 口径清单缺新码 / 产生点失效 | `npx tsx tests/drill/refresh-error-code-inventory.mts` | 重扫并**合并**；新码以 `tier=unclassified` 追加；**幂等**（内容无变化不写盘） |
| `unclassified` 未归零 | 同上 | 刷新**不代劳分级**：分级义务留在清单里，未清零即红 |
| 基线两集合与 failures 不一致 | `npx tsx tests/drill/triage-baseline.mts` | 输出差集报告（新增/消失各几条 + 点名），**只报告不落盘** |
| 演练 | `npx tsx tests/drill/reverse-drill-error-codes.mts` | 全组演练（改坏 → 判据必红 → 逐字节还原） |

**`refresh` 的不变量**（防「刷新即洗绿」）：已存在条目不得被删除（src 里消失的码**保留条目 + 响亮报出**）；
`unclassified` 只减不增；连跑两次第二次零写入（**已实测**）。

## 与既有接口的兼容 `serves: FR-9`

| 既有接口 | 是否改语义 | 依据 |
|---|---|---|
| `pnpm test` / `npx vitest run` | 否（只加 setupFiles、execArgv 与用例） | FR-9① |
| `pnpm baseline:check` / `--refresh` | **否**（`failures.txt` 与 `test-baseline.md` 格式语义一字不改） | FR-4、FR-9① |
| `tool-deps.resolveWorkspaceRoot` 行为 | 否（抽出为独立模块，语义逐字保留） | FR-9① |
| `tests/compat-regression.test.ts` | 否（不动；本需求守卫与它互补） | FR-5 |
| `tests/rtm-validator-tolerance.test.ts` | 否（只读它依赖的真实目录） | FR-9③、D-7 |
