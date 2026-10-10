/**
 * 分层依赖方向门禁（REQ-261009174713-7bc8 t3 / RF-15、RF-24）。
 *
 * 为什么需要它：`docs/architecture` 的分层图原本只是**文字纪律**——`src/` 内 import 可任意穿越。
 * 拆包后依赖方向必须变成**物理约束**：分层白名单唯一权威 = `design/architecture.md` 的分层表，
 * 这里把它写成可执行判据（声明面 + 使用面两侧都查）。
 *
 * 判据（四类越界，逐类点名）：
 *   ① layer-declaration    包声明了不在本层白名单里的 workspace 依赖
 *   ② undeclared-import    src 里 import 了未声明的 workspace 包
 *   ③ cross-dir-import     tool-pm 内的横向目录引用（除 kit/）
 *   ④ asset-import         资产包（零代码依赖）里出现任何 import
 *
 * 用法：npx tsx scripts/package-boundary-check.mts [--root <dir>] [--json]
 * 退出码：0 = 无越界；1 = 有越界（逐条打印）；2 = 用法/环境错（不是「有越界」，别混为一谈）。
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'

const argv = process.argv.slice(2)
const argOf = (flag: string): string | undefined => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const ROOT = resolve(argOf('--root') ?? process.cwd())
const AS_JSON = argv.includes('--json')

/** 分层白名单（唯一权威：design/architecture.md 的分层表）。 */
export const LAYERS = [
  { layer: 'L0', pkgs: ['pm-common', 'reqboard-rtm'], allow: [] },
  { layer: 'L0.5', pkgs: ['pm-type-kit'], allow: ['pm-common'] },
  {
    layer: 'L0.5',
    pkgs: ['pm-type-feature', 'pm-type-bug', 'pm-type-doc', 'pm-type-refactor', 'pm-type-spike', 'pm-type-chore'],
    allow: ['pm-common', 'pm-type-kit'],
  },
  { layer: 'L1', pkgs: ['pm-core'], allow: ['pm-common', 'reqboard-rtm', 'pm-type-kit'] },
  {
    layer: 'L2',
    pkgs: ['tool-pm', 'pm-round-driver', 'pm-workflow', 'pm-client', 'command-pm'],
    allow: ['pm-common', 'pm-core'],
  },
  { layer: 'L3', pkgs: ['pm-templates', 'pm-skills', 'pm-eval-suite', 'pm-scripts'], allow: [] },
] as const

const WORKSPACE_PKGS: readonly string[] = LAYERS.flatMap(l => [...l.pkgs])
const ASSET_PKGS: readonly string[] = ['pm-templates', 'pm-skills', 'pm-eval-suite', 'pm-scripts']
const allowOf = (pkg: string): readonly string[] => LAYERS.find(l => (l.pkgs as readonly string[]).includes(pkg))?.allow ?? []
const layerOf = (pkg: string): string => LAYERS.find(l => (l.pkgs as readonly string[]).includes(pkg))?.layer ?? '?'

interface Violation {
  kind: 'layer-declaration' | 'undeclared-import' | 'cross-dir-import' | 'asset-import'
  pkg: string
  detail: string
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) walk(abs, out)
    else if (st.isFile() && (name.endsWith('.ts') || name.endsWith('.mts'))) out.push(abs)
  }
  return out
}

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g
const violations: Violation[] = []

for (const pkg of WORKSPACE_PKGS) {
  const pkgDir = join(ROOT, 'pm', pkg)
  const manifestPath = join(pkgDir, 'package.json')
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies?: Record<string, string> }
  const declared = Object.keys(manifest.dependencies ?? {})
  const allow = allowOf(pkg)

  // ① 声明面：不得声明白名单外的 workspace 依赖（第三方依赖不属本门禁判据）
  for (const dep of declared) {
    if (!WORKSPACE_PKGS.includes(dep)) continue
    if (!allow.includes(dep)) {
      violations.push({ kind: 'layer-declaration', pkg, detail: '声明了 ' + dep + '（本层白名单：' + (allow.length === 0 ? '无' : allow.join('、')) + '）' })
    }
  }

  // ④ 资产包：零代码依赖 + src 内不得有任何 import
  if (ASSET_PKGS.includes(pkg)) {
    for (const file of walk(join(pkgDir, 'src'))) {
      if (IMPORT_RE.test(readFileSync(file, 'utf8'))) {
        violations.push({ kind: 'asset-import', pkg, detail: relative(ROOT, file) + ' 含 import（资产包必须零代码依赖）' })
      }
    }
    continue
  }

  // ②③ 使用面
  for (const file of walk(join(pkgDir, 'src'))) {
    const text = readFileSync(file, 'utf8')
    const relInPkg = relative(pkgDir, file)
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1]
      const bare = WORKSPACE_PKGS.find(p => spec === p || spec.startsWith(p + '/'))
      if (bare !== undefined && bare !== pkg && !declared.includes(bare)) {
        violations.push({ kind: 'undeclared-import', pkg, detail: relInPkg + ' import ' + spec + '（未在 package.json 声明）' })
      }
      // ③ tool-pm 内横向目录引用：**四类目录之间**不得互引（只允许经 kit/）。
      //   口径（t15 收窄）：只有「src/<类别目录>/… 内的文件」才受此约束——包根的 `registry.ts` /
      //   `index.ts` 是该包的**聚合面**（RF-20：registry 聚合四目录、根包只消费），必须允许它们引四类目录；
      //   否则「把 19 个工具收进单包」在物理上根本做不到。
      if (pkg === 'tool-pm' && spec.startsWith('.')) {
        const parts = relInPkg.split('/') // ['src', '<dir>', ...file]
        const fromDir = parts.length > 2 ? parts[1] : undefined
        const target = relative(join(pkgDir, 'src'), resolve(dirname(file), spec))
        const toDir = target.split('/')[0]
        const CATEGORY_DIRS = ['intake', 'decompose', 'verify', 'collab']
        if (fromDir !== undefined && CATEGORY_DIRS.includes(fromDir) && toDir !== undefined
            && CATEGORY_DIRS.includes(toDir) && fromDir !== toDir) {
          violations.push({ kind: 'cross-dir-import', pkg, detail: relInPkg + ' → src/' + toDir + '/（横向目录引用，只允许经 kit/）' })
        }
      }
    }
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ root: ROOT, packages: WORKSPACE_PKGS.length, violations }, null, 2))
} else if (violations.length === 0) {
  console.log('OK：分层依赖方向门禁通过（扫描 ' + String(WORKSPACE_PKGS.length) + ' 个包的声明面与使用面）')
} else {
  console.error('FAIL：发现 ' + String(violations.length) + ' 处越界')
  for (const v of violations) console.error('  [' + v.kind + '] ' + v.pkg + ' :: ' + v.detail)
}
process.exit(violations.length === 0 ? 0 : 1)
