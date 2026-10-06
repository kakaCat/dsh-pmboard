#!/usr/bin/env node
/**
 * skill 资产 vendoring 生成器 + 漂移门禁。
 *
 * 为什么需要它：本插件要随包发布 7 份 UI/UX 设计 skill 资产（上游 ui-ux-pro-max-skill 的
 * .claude/skills/），供 subagent 从物化副本读取。资产一旦进包就是**唯一事实源**——
 * 上游副本不在运行时可达，所以"谁手改了一个 vendored 文件"不会有任何外部信号。
 * 这份脚本把两件事钉在一起：
 *   ① 可复现收录（copy + 裁剪 + 写 PROVENANCE.md 版本指纹）：node scripts/vendor-skills.mjs；
 *   ② 无声漂移检测（只读比对 sha256 / skills 清单 / 目录体积）：--check。
 * 纪律：脚本只做"整目录原样复制 + 按 glob 裁掉非运行时资产"，不得改写被收录文件的字节；
 * 确定性（目录遍历排序、sha256 键排序、fetchedAt 固定日期），同源两次运行产物逐字节一致。
 *
 * 裁剪口径（每条都要在 PROVENANCE.md 的 trimmed 里留下真实字节数与理由）：
 *   - **\/scripts\/**\/tests\/       上游自测（scripts 下任意层级的 tests），非运行时资产
 *   - ui-styling/canvas-fonts/      字体二进制，非检索/规则依赖
 *   - ui-ux-pro-max/data/phosphor-icons-upstream.json  上游图标目录刷新用
 *   - ui-ux-pro-max/data/google-font-licenses.json     许可展示用
 *   - **\/__pycache__\/             Python 字节码缓存（生成物，上游 gitignore；跑一次资产即被重写）
 *
 * 体积门禁：skills/ 合计必须 ≤ 5MB（超过即响亮失败，不静默发布）。
 *
 * 用法：
 *   node scripts/vendor-skills.mjs [--from <repo>]   收录/刷新（写盘）
 *   node scripts/vendor-skills.mjs --check           漂移门禁（不写盘；不一致 exit 1）
 * 依赖：只用 Node 内置模块（fs/path/crypto/child_process），git 仅用于读 HEAD。
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = join(HERE, '..')
const SKILLS_DIR = join(PKG_ROOT, 'skills')
const PROVENANCE_FILE = join(SKILLS_DIR, 'PROVENANCE.md')
const PROVENANCE_REL = 'skills/PROVENANCE.md'

const DEFAULT_SOURCE_REPO = '/tmp/uupm/repo'
const SOURCE_SKILLS_REL = '.claude/skills'
const UPSTREAM_URL = 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill'
const UPSTREAM_LICENSE = 'MIT'
/** 收录时的上游 commit（脚本运行时仍以 git rev-parse 为准，不一致即响亮失败）。 */
const UPSTREAM_COMMIT = '477bcb28c9812b385cb51a4605ddf30d7b2266e2'
/** 固定日期，保证产物确定性（--check 不比对它）。 */
const FETCHED_AT = '2026-10-05'
const MAX_TOTAL_BYTES = 5 * 1024 * 1024
const FALLBACK_COPYRIGHT = 'Copyright (c) 2024 Next Level Builder'

/** 收录的 7 个 skill；PROVENANCE.md 里必须排序后写、且与实际一级子目录双向一致。 */
const SKILL_NAMES = [
  'ui-ux-pro-max',
  'ui-styling',
  'design',
  'design-system',
  'brand',
  'slides',
  'banner-design',
]

/**
 * 裁剪规则。match(rel, isDir) 判定"该路径整体不收录"（命中目录即整棵子树不遍历）。
 * rel 为相对 <source>/.claude/skills 的 POSIX 路径。
 */
const EXCLUDES = [
  {
    // 一条规则覆盖任意层级：只要 tests 目录的祖先里有名为 scripts 的目录（scripts/tests、
    // scripts/logo/tests、scripts/a/b/tests …）都算"上游自测"，不另立第二条规则。
    glob: '**/scripts/**/tests/',
    why: '上游自测，非运行时资产',
    match: (rel, isDir) => {
      if (!isDir) return false
      const segs = rel.split('/')
      if (segs[segs.length - 1] !== 'tests') return false
      return segs.slice(0, -1).includes('scripts')
    },
  },
  {
    glob: 'ui-styling/canvas-fonts/',
    why: '字体二进制，非检索/规则依赖',
    match: (rel, isDir) => isDir && rel === 'ui-styling/canvas-fonts',
  },
  {
    glob: 'ui-ux-pro-max/data/phosphor-icons-upstream.json',
    why: '上游图标目录刷新用（实测删后检索仍可用）',
    match: (rel, isDir) => !isDir && rel === 'ui-ux-pro-max/data/phosphor-icons-upstream.json',
  },
  {
    glob: 'ui-ux-pro-max/data/google-font-licenses.json',
    why: '许可展示用（同上）',
    match: (rel, isDir) => !isDir && rel === 'ui-ux-pro-max/data/google-font-licenses.json',
  },
  {
    glob: '**/__pycache__/',
    why: 'Python 字节码缓存（生成物，上游 gitignore；跑一次 vendored 资产就会被重写，包内不应携带）',
    match: (rel, isDir) => isDir && rel.split('/').pop() === '__pycache__',
  },
]

function isExcluded(rel, isDir) {
  return EXCLUDES.some((rule) => rule.match(rel, isDir))
}

/** 排序读目录：遍历顺序确定 → 产物确定。 */
function sortedEntries(absDir) {
  return readdirSync(absDir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )
}

/**
 * 确定性遍历：返回 { rel, abs, bytes, dirs, files }，跳过 symlink 与命中裁剪规则的子树。
 * baseRel = 本子树相对 <source>/.claude/skills 的前缀（裁剪规则按这个全路径判定，
 * 而 rel 保持"相对本子树"，供复制落盘使用）。
 * 不跟随符号链接（源树无链接；若将来出现，宁可漏收录也不越出源目录）。
 */
function walkTree(rootAbs, { baseRel = '', onExcluded } = {}) {
  const files = []
  const dirs = []
  let bytes = 0
  const rec = (abs, rel) => {
    for (const ent of sortedEntries(abs)) {
      const childRel = rel ? rel + '/' + ent.name : ent.name
      const childAbs = join(abs, ent.name)
      const matchRel = baseRel ? baseRel + '/' + childRel : childRel
      if (ent.isSymbolicLink()) continue
      if (ent.isDirectory()) {
        if (isExcluded(matchRel, true)) {
          if (onExcluded) onExcluded(matchRel, true, childRel)
          continue
        }
        dirs.push(childRel)
        rec(childAbs, childRel)
      } else if (ent.isFile()) {
        if (isExcluded(matchRel, false)) {
          if (onExcluded) onExcluded(matchRel, false, childRel)
          continue
        }
        const bytes_ = statSync(childAbs).size
        files.push({ rel: childRel, abs: childAbs, bytes: bytes_ })
        bytes += bytes_
      }
    }
  }
  rec(rootAbs, '')
  return { files, dirs, bytes }
}

/** 递归字节数（文件内容字节和，不是块占用）。 */
function recursiveBytes(abs) {
  const st = statSync(abs)
  if (st.isFile()) return st.size
  if (!st.isDirectory()) return 0
  let total = 0
  for (const ent of sortedEntries(abs)) {
    if (ent.isSymbolicLink()) continue
    total += recursiveBytes(join(abs, ent.name))
  }
  return total
}

function sha256File(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex')
}

/** 指纹口径：每个 skill 的 SKILL.md + 其 scripts/ 树下全部 *.py（递归，键为 skills/ 相对 POSIX 路径）。 */
function fingerprintPaths(skill) {
  const out = []
  if (existsSync(join(SKILLS_DIR, skill, 'SKILL.md'))) out.push('SKILL.md')
  const scriptsDir = join(SKILLS_DIR, skill, 'scripts')
  if (existsSync(scriptsDir)) {
    for (const f of walkTree(scriptsDir).files) {
      if (f.rel.endsWith('.py')) out.push('scripts/' + f.rel)
    }
  }
  return out.sort().map((rel) => skill + '/' + rel)
}

function fingerprintMap() {
  const map = {}
  for (const skill of listOnDiskSkills()) {
    for (const key of fingerprintPaths(skill)) {
      map[key] = sha256File(join(SKILLS_DIR, key))
    }
  }
  return map
}

function listOnDiskSkills() {
  if (!existsSync(SKILLS_DIR)) return []
  return sortedEntries(SKILLS_DIR)
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
}

function readUpstreamCommit(repoDir) {
  try {
    const out = execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
    return out.trim()
  } catch {
    return ''
  }
}

function upstreamCopyright(repoDir) {
  try {
    const text = readFileSync(join(repoDir, 'LICENSE'), 'utf8')
    const line = text.split('\n').find((l) => /^Copyright\b/i.test(l.trim()))
    return line ? line.trim() : FALLBACK_COPYRIGHT
  } catch {
    return FALLBACK_COPYRIGHT
  }
}

function parseArgs(argv) {
  const opts = { check: false, from: DEFAULT_SOURCE_REPO }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--check') opts.check = true
    else if (arg === '--from') {
      const value = argv[++i]
      if (!value) {
        console.error('[vendor-skills] FAIL: --from 需要一个目录参数')
        process.exit(1)
      }
      opts.from = value
    } else if (arg.startsWith('--from=')) opts.from = arg.slice('--from='.length)
    else {
      console.error('[vendor-skills] FAIL: 未知参数 ' + arg + '（用法见文件头）')
      process.exit(1)
    }
  }
  return opts
}

function fmtBytes(n) {
  return n + ' B (' + (n / 1024 / 1024).toFixed(2) + ' MiB)'
}

// ---------------------------------------------------------------- 收录（写盘）

function vendor(sourceRepo) {
  console.log('[vendor-skills] 源仓库: ' + sourceRepo + '（收录基线 commit ' + UPSTREAM_COMMIT + '）')
  const skillsSrc = join(sourceRepo, SOURCE_SKILLS_REL)
  if (!existsSync(skillsSrc)) {
    console.error('[vendor-skills] FAIL: 源 skills 目录不存在: ' + skillsSrc)
    process.exit(1)
  }
  const missing = SKILL_NAMES.filter((n) => !existsSync(join(skillsSrc, n)))
  if (missing.length > 0) {
    console.error('[vendor-skills] FAIL: 源里缺少 skill: ' + missing.join(', '))
    process.exit(1)
  }
  // 指纹口径要求每个 skill 都有 SKILL.md；源里缺了就是"收了个空壳"，宁可响亮失败。
  const noSkillMd = SKILL_NAMES.filter((n) => !existsSync(join(skillsSrc, n, 'SKILL.md')))
  if (noSkillMd.length > 0) {
    console.error('[vendor-skills] FAIL: 源里这些 skill 缺 SKILL.md: ' + noSkillMd.join(', '))
    process.exit(1)
  }

  // 裁剪字节数：从源树实测（命中目录按递归字节和算，且不再重复计其子项）。
  const trimmed = EXCLUDES.map((rule) => ({ glob: rule.glob, bytes: 0, why: rule.why }))
  for (const skill of SKILL_NAMES) {
    walkTree(join(skillsSrc, skill), {
      baseRel: skill,
      onExcluded: (matchRel, isDir, rel) => {
        for (const [i, rule] of EXCLUDES.entries()) {
          if (rule.match(matchRel, isDir)) {
            trimmed[i].bytes += recursiveBytes(join(skillsSrc, skill, rel))
            break
          }
        }
      },
    })
  }

  const commit = readUpstreamCommit(sourceRepo)
  if (!commit) {
    console.error(
      '[vendor-skills] WARN: 读不到 git HEAD（' + sourceRepo + ' 非 git 仓库？），回落记录 ' + UPSTREAM_COMMIT,
    )
  } else if (commit !== UPSTREAM_COMMIT) {
    console.error(
      '[vendor-skills] FAIL: 源 commit 与收录基线不一致\n  期望 ' + UPSTREAM_COMMIT + '\n  实际 ' + commit +
        '\n  若确为有意换源，请更新脚本里的 UPSTREAM_COMMIT 后重跑（并复核 trimmed 字节数）。',
    )
    process.exit(1)
  }

  // 只清本脚本管理的 7 个 skill 目录 + PROVENANCE.md；不碰 skills/ 下的其它内容。
  mkdirSync(SKILLS_DIR, { recursive: true })
  for (const skill of SKILL_NAMES) {
    rmSync(join(SKILLS_DIR, skill), { recursive: true, force: true })
  }
  rmSync(PROVENANCE_FILE, { force: true })

  // 复制（确定性遍历，逐文件 copy）。
  const perSkill = []
  let totalBytes = 0
  let totalFiles = 0
  for (const skill of SKILL_NAMES) {
    const src = join(skillsSrc, skill)
    const dst = join(SKILLS_DIR, skill)
    const tree = walkTree(src, { baseRel: skill })
    mkdirSync(dst, { recursive: true })
    for (const dir of tree.dirs) mkdirSync(join(dst, dir), { recursive: true })
    for (const file of tree.files) {
      mkdirSync(dirname(join(dst, file.rel)), { recursive: true })
      copyFileSync(file.abs, join(dst, file.rel))
    }
    perSkill.push({ skill, bytes: tree.bytes, files: tree.files.length })
    totalBytes += tree.bytes
    totalFiles += tree.files.length
  }

  const sha256 = fingerprintMap()
  const provenance = renderProvenance({ commit: commit || UPSTREAM_COMMIT, trimmed, sha256, copyright: upstreamCopyright(sourceRepo) })
  // 体积口径与 --check 一致：整个 skills/（7 份资产 + PROVENANCE.md 本身）。
  const provenanceBytes = Buffer.byteLength(provenance, 'utf8')
  const dirBytes = totalBytes + provenanceBytes

  // 体积门禁：超 5MB 即响亮失败（不写 PROVENANCE.md，避免发布"已收录"的假象）。
  if (dirBytes > MAX_TOTAL_BYTES) {
    console.error(
      '[vendor-skills] FAIL: skills/ 合计 ' + fmtBytes(dirBytes) + ' 超过上限 ' + fmtBytes(MAX_TOTAL_BYTES) +
        '\n  请复核 trimmed 规则（是否有大文件漏裁）。',
    )
    process.exit(1)
  }

  writeFileSync(PROVENANCE_FILE, provenance, 'utf8')

  console.log('[vendor-skills] 已收录 ' + SKILL_NAMES.length + ' 个 skill → ' + SKILLS_DIR)
  for (const row of perSkill) {
    console.log('  - ' + row.skill.padEnd(16) + String(row.bytes).padStart(9) + ' B  ' + String(row.files).padStart(4) + ' 文件')
  }
  console.log('[vendor-skills] 裁剪（实测）：')
  for (const row of trimmed) {
    console.log('  - ' + row.glob.padEnd(48) + String(row.bytes).padStart(10) + ' B  ' + row.why)
  }
  console.log(
    '[vendor-skills] 资产合计 ' + fmtBytes(totalBytes) + ' / ' + totalFiles + ' 文件；' +
      'skills/ 整目录 ' + fmtBytes(dirBytes) + ' / ' + (totalFiles + 1) + ' 文件；上限 ' + fmtBytes(MAX_TOTAL_BYTES) + '（未超）',
  )
  console.log('[vendor-skills] 指纹 ' + Object.keys(sha256).length + ' 条 → ' + PROVENANCE_REL)
}

function renderProvenance({ commit, trimmed, sha256, copyright }) {
  const lines = []
  lines.push('---')
  lines.push('source: ' + UPSTREAM_URL)
  lines.push('license: ' + UPSTREAM_LICENSE)
  lines.push('commit: ' + commit)
  lines.push('fetchedAt: ' + FETCHED_AT)
  lines.push('skills:')
  for (const skill of [...SKILL_NAMES].sort()) lines.push('  - ' + skill)
  lines.push('trimmed:')
  for (const row of trimmed) {
    lines.push('  - glob: "' + row.glob + '"')
    lines.push('    bytes: ' + row.bytes)
    lines.push('    why: ' + row.why)
  }
  lines.push('sha256:')
  for (const key of Object.keys(sha256).sort()) lines.push('  ' + key + ': ' + sha256[key])
  lines.push('---')
  lines.push('')
  lines.push('## 这是什么')
  lines.push('')
  lines.push('本目录是上游 `ui-ux-pro-max-skill` 仓库 `.claude/skills/` 下 7 个 skill 资产的**原样副本**')
  lines.push('（只按上面 `trimmed` 规则裁掉非运行时资产，不改写任何被收录文件的字节）。')
  lines.push('包内这份副本是运行时唯一事实源：subagent 从物化副本读取，不依赖网络与上游仓库。')
  lines.push('')
  lines.push('## 许可')
  lines.push('')
  lines.push('上游以 ' + UPSTREAM_LICENSE + ' 许可发布，版权声明：')
  lines.push('')
  lines.push('> ' + copyright)
  lines.push('')
  lines.push('（出处：<' + UPSTREAM_URL + '/blob/' + commit + '/LICENSE>）')
  lines.push('')
  lines.push('## 如何刷新')
  lines.push('')
  lines.push('```')
  lines.push('node scripts/vendor-skills.mjs            # 默认源 ' + DEFAULT_SOURCE_REPO)
  lines.push('node scripts/vendor-skills.mjs --from <repo>')
  lines.push('```')
  lines.push('')
  lines.push('刷新会重写 `skills/<skill>/`（仅本脚本管理的 7 个）与本文件；源 commit 与基线不一致会响亮失败。')
  lines.push('')
  lines.push('## 如何发现漂移')
  lines.push('')
  lines.push('```')
  lines.push('node scripts/vendor-skills.mjs --check')
  lines.push('```')
  lines.push('')
  lines.push('不写盘：重算 `sha256` 清单（含缺文件/多文件）、比对 `skills` 与实际一级子目录、')
  lines.push('复核 `<pkg>/skills` 合计 ≤ 5MB。任何不一致打印差异到 stderr 并 `exit 1`——')
  lines.push('所以"手改了一个 vendored 文件"不会静默通过。')
  lines.push('')
  return lines.join('\n')
}

// ---------------------------------------------------------------- 漂移门禁（只读）

/** 极简 front-matter 解析（只认本文件写出的形状；不引外部依赖，也不需要完整 YAML）。 */
function parseFrontMatter(text) {
  const lines = text.split('\n')
  if (lines.length === 0 || lines[0].trim() !== '---') return null
  const body = []
  let i = 1
  for (; i < lines.length; i++) {
    if (lines[i].trim() === '---') break
    body.push(lines[i])
  }
  if (i >= lines.length) return null

  const out = { skills: [], trimmed: [], sha256: {} }
  let section = null
  const unquote = (v) => {
    const s = v.trim()
    if ((s.startsWith('"') && s.endsWith('"') && s.length >= 2) || (s.startsWith("'") && s.endsWith("'") && s.length >= 2)) {
      return s.slice(1, -1)
    }
    return s
  }
  for (const raw of body) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue
    const indent = raw.length - raw.trimStart().length
    const line = raw.trim()
    if (indent === 0) {
      const m = /^([A-Za-z0-9_]+):(.*)$/.exec(line)
      if (!m) return null
      const value = m[2].trim()
      if (value === '') {
        section = m[1]
      } else {
        section = null
        out[m[1]] = unquote(value)
      }
      continue
    }
    if (section === 'skills') {
      const m = /^-\s+(.*)$/.exec(line)
      if (!m) return null
      out.skills.push(unquote(m[1]))
    } else if (section === 'trimmed') {
      if (line.startsWith('- ')) {
        const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.slice(2))
        if (!kv) return null
        out.trimmed.push({ [kv[1]]: unquote(kv[2]) })
      } else {
        const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
        if (!kv || out.trimmed.length === 0) return null
        const item = out.trimmed[out.trimmed.length - 1]
        item[kv[1]] = kv[1] === 'bytes' ? Number(kv[2].trim()) : unquote(kv[2])
      }
    } else if (section === 'sha256') {
      const kv = /^([^:]+):\s*(.+)$/.exec(line)
      if (!kv) return null
      out.sha256[kv[1].trim()] = unquote(kv[2])
    } else {
      return null
    }
  }
  return out
}

function check() {
  const problems = []
  if (!existsSync(PROVENANCE_FILE)) {
    console.error('[vendor-skills] FAIL: 找不到 ' + PROVENANCE_REL + '（先跑 node scripts/vendor-skills.mjs）')
    process.exit(1)
  }
  const fm = parseFrontMatter(readFileSync(PROVENANCE_FILE, 'utf8'))
  if (!fm) {
    console.error('[vendor-skills] FAIL: ' + PROVENANCE_REL + ' 的 front-matter 解析失败（形状被改过？）')
    process.exit(1)
  }
  for (const key of ['source', 'license', 'commit', 'fetchedAt']) {
    if (!fm[key]) problems.push('front-matter 缺字段 ' + key)
  }
  if (fm.commit && !/^[0-9a-f]{40}$/.test(fm.commit)) problems.push('commit 不是 40 位 hex: ' + fm.commit)

  // ① skills 清单 ↔ 磁盘一级子目录（双向一致）
  const recorded = [...fm.skills].sort()
  const onDisk = listOnDiskSkills()
  const missingDirs = recorded.filter((s) => !onDisk.includes(s))
  const extraDirs = onDisk.filter((s) => !recorded.includes(s))
  for (const s of missingDirs) problems.push('skills 清单记了但磁盘上没有: ' + s)
  for (const s of extraDirs) problems.push('磁盘上有但 skills 清单未收: skills/' + s)
  for (const s of onDisk) {
    if (!existsSync(join(SKILLS_DIR, s, 'SKILL.md'))) problems.push('skill 缺 SKILL.md: skills/' + s + '/SKILL.md')
  }

  // ② 指纹清单 ↔ 重算的指纹路径（缺文件/多文件）
  const actual = fingerprintMap()
  const recordedKeys = Object.keys(fm.sha256)
  for (const key of recordedKeys) {
    if (!(key in actual)) problems.push('指纹记了但磁盘上没有: skills/' + key)
  }
  for (const key of Object.keys(actual)) {
    if (!(key in fm.sha256)) problems.push('磁盘上有但指纹未覆盖（新增的 SKILL.md / *.py？）: skills/' + key)
  }

  // ③ sha256 逐条比对（漂移主检测）
  let compared = 0
  for (const key of recordedKeys.sort()) {
    if (!(key in actual)) continue
    compared++
    if (actual[key] !== fm.sha256[key]) {
      problems.push(
        'sha256 不一致: skills/' + key + '\n      记录 ' + fm.sha256[key] + '\n      实测 ' + actual[key],
      )
    }
  }

  // ④ 目录体积门禁
  const totalBytes = existsSync(SKILLS_DIR) ? recursiveBytes(SKILLS_DIR) : 0
  if (totalBytes > MAX_TOTAL_BYTES) {
    problems.push('skills/ 合计 ' + fmtBytes(totalBytes) + ' 超过上限 ' + fmtBytes(MAX_TOTAL_BYTES))
  }

  if (problems.length > 0) {
    console.error('[vendor-skills] FAIL: 检测到漂移/不一致（' + problems.length + ' 项）：')
    for (const p of problems) console.error('  - ' + p)
    console.error('  若为有意改动：请重跑 node scripts/vendor-skills.mjs 重新收录并刷新指纹。')
    process.exit(1)
  }
  console.log(
    '[vendor-skills] OK: ' + compared + ' 条 sha256 指纹一致；skills 清单 ' + recorded.length + ' 项与磁盘一致；' +
      '合计 ' + fmtBytes(totalBytes) + '（上限 ' + fmtBytes(MAX_TOTAL_BYTES) + '）',
  )
}

// ---------------------------------------------------------------- 入口

const opts = parseArgs(process.argv.slice(2))
if (opts.check) check()
else vendor(opts.from)
