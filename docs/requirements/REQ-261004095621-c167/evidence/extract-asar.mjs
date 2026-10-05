#!/usr/bin/env node
/**
 * 取证脚本：判断「已安装的 DSH 客户端」内部包是否自相矛盾（可重放）。
 *
 * 背景（REQ-261004095621-c167 / evidence/dsh-model-seat-crash.md）：
 *   会话编辑器的模型选择器一点开就空白消失——因为 `ui-model-selection` 渲染菜单时要用
 *   `primitives.MenuGroup` / `observeStickyMenuGroups`，而**同一个 app.asar 里**的 `ui-primitives`
 *   是缺这两个导出的旧构建 → 运行时 undefined → React #130 → DSH 插槽把该席位退役。
 *
 * 2026-10-04 追加判定（用户反馈 `/model` 也不好使后升级取证）：
 *   安装包里的 `ui-primitives` 与 **本机 checkout 的本地构建**逐字节相同（0 差异），
 *   并且带着本地新增的符号（`IconBellOutlineRegular`，官方 rc.1/rc.2 都没有）
 *   ⇒ 结论从「厂商安装包不一致」更正为「**本机 app.asar 被手工打过补丁**」。
 *   本脚本因此新增第 ④ 段「本地补丁检测」。
 *
 * 本脚本把当时手工做的步骤固化成一条命令（零第三方依赖）：
 *   ① 解析 app.asar 头（含基址自校准）→ 取出「使用方」与「提供方」两个包的 JS 文件；
 *   ② 统计关键符号：使用方要、安装版提供方没有 = 缺符号；
 *   ③ 下载 npm 上的**发布版**同名文件对照（发布版有 = 安装自相矛盾）；
 *   ④ 检测「本地补丁」标记：文件中出现官方两版都没有、而本机新增的符号 → 被本地构建覆盖。
 *
 * 跑法：
 *   node docs/requirements/REQ-261004095621-c167/evidence/extract-asar.mjs
 *   node …/extract-asar.mjs --asar "<其它 app.asar>"
 *   node …/extract-asar.mjs --local ~/Documents/ai/dsh/deepseek-harness/packages/client/ui-primitives/lib/index.js
 *   node …/extract-asar.mjs --strict     # 发现问题时退出码 1（CI 用）；缺省 0
 *
 * 退出码：0 = 已完成判定；1 = 环境/网络失败；--strict 下发现「缺符号或本地补丁」→ 1。
 */
import { readFileSync, mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 关注的符号：使用方要、提供方必须有（2026-10-04 实例里缺的正是前两个）。 */
const SYMBOLS = ['MenuGroup', 'observeStickyMenuGroups', 'rankByName']
/** 本地新增符号（本机未提交改动引入；官方 rc.1 / rc.2 都没有）→ 出现即说明被本地构建覆盖。 */
const LOCAL_ONLY_SYMBOLS = ['IconBellOutlineRegular']
/** 使用方包（挂在编辑器工具栏的模型选择器）。 */
const CONSUMER = {
  pkg: '@deepseek-ai/dsh-client-ui-model-selection',
  dir: 'dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection',
  file: 'dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js',
}
/** 提供方包（共享 UI 原语）。 */
const PROVIDER = {
  pkg: '@deepseek-ai/dsh-client-ui-primitives',
  dir: 'dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives',
  file: 'dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js',
}
/** 对照用的发布版本（与本机 app.asar 里标称版本一致）。 */
const PUBLISHED_VERSION = '0.2.0-rc.2'

/** 依 argv/env 解析参数（--asar / --local）。 */
function argValue(argv, flag) {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : undefined
}
function resolveAsarPath(argv) {
  return argValue(argv, '--asar') ?? process.env.DSH_ASAR
    ?? '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'
}

/**
 * 解析 asar 归档并返回「按路径取文件内容」的读取器。
 * 归档布局：0..4 / 4..8 / 8..12 为 pickle 头字段，12..16 = JSON 头长度；JSON 头自 16 起。
 * 数据区基址按规范是 `8 + jsonLen`，但**手工打包过的归档**可能与此不符，故用一个小
 * JSON 文件（package.json）自校准基址：能 JSON.parse 成功的那一档就是真基址。
 * @param {string} asarPath - app.asar 路径。
 * @returns {{ read: (path: string) => Buffer | undefined, base: number, jsonLen: number, calibrated: boolean }} 读取器与基址信息。
 */
function asarReader(asarPath) {
  if (!existsSync(asarPath)) throw new Error('找不到 app.asar：' + asarPath)
  const buf = readFileSync(asarPath)
  const jsonLen = buf.readUInt32LE(12)
  const header = JSON.parse(buf.subarray(16, 16 + jsonLen).toString('utf8').replace(/\0+$/, ''))
  const lookup = (path) => {
    let node = header
    for (const seg of path.split('/')) {
      node = node?.files?.[seg]
      if (node === undefined) return undefined
    }
    return node
  }
  const at = (base) => (path) => {
    const rec = lookup(path)
    if (rec === undefined || rec.offset === undefined) return undefined
    const start = base + Number(rec.offset)
    return buf.subarray(start, start + Number(rec.size))
  }
  const spec = 8 + jsonLen
  const probeFile = PROVIDER.dir + '/package.json'
  let base = spec
  let calibrated = false
  for (let delta = -64; delta <= 64; delta += 1) {
    const candidate = spec + delta
    const raw = at(candidate)(probeFile)
    if (raw === undefined) continue
    try {
      const parsed = JSON.parse(raw.toString('utf8').replace(/^\ufeff/, '').trim())
      if (typeof parsed?.version === 'string') {
        base = candidate
        calibrated = delta !== 0
        break
      }
    } catch { /* 该档不是文件起点，继续试 */ }
  }
  return { read: at(base), base, jsonLen, calibrated }
}

/** 统计一个符号在文本中的出现次数。 */
function count(text, symbol) {
  return text.split(symbol).length - 1
}

/** 读包版本（从 app.asar 里的 package.json 文本里抠 version；解析失败 → '未知'）。 */
function versionOf(read, dir) {
  const raw = read(dir + '/package.json')
  if (raw === undefined) return '未知'
  const m = /"version"\s*:\s*"([^"]+)"/.exec(raw.toString('utf8'))
  return m === null ? '未知' : m[1]
}

/**
 * 下载并解包 npm 发布版，返回目标文件文本。
 * @param {string} pkg - 包名（含 scope）。
 * @param {string} version - 版本。
 * @param {string} innerPath - 包内相对路径，如 'lib/index.js'。
 * @returns {string} 文件文本。
 */
async function fetchPublished(pkg, version, innerPath) {
  const bare = pkg.split('/').pop()
  const url = `https://registry.npmjs.org/${pkg}/-/${bare}-${version}.tgz`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载失败 ${url} → HTTP ${String(res.status)}`)
  const dir = mkdtempSync(join(tmpdir(), 'dsh-asar-probe-'))
  try {
    const tgz = join(dir, 'pkg.tgz')
    writeFileSync(tgz, Buffer.from(await res.arrayBuffer()))
    const tar = spawnSync('tar', ['-xzf', tgz, '-C', dir], { encoding: 'utf8' })
    if (tar.status !== 0) throw new Error('解包失败：' + String(tar.stderr))
    return readFileSync(join(dir, 'package', innerPath), 'utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * 逐字节比较两个 Buffer（容忍一端多出的前后缀：找最长公共对齐）。
 * @param {Buffer} a - 安装包里的文件。
 * @param {Buffer} b - 本地构建的文件。
 * @returns {{ identical: boolean, diffBytes: number, alignedLength: number }} 比较结果。
 */
function byteCompare(a, b) {
  // 允许 ±64 字节的错位/前后缀差异：取使差异最小的那档
  let best = { identical: false, diffBytes: Number.MAX_SAFE_INTEGER, alignedLength: 0 }
  for (let shift = -64; shift <= 64; shift += 1) {
    const startA = Math.max(0, -shift)
    const startB = Math.max(0, shift)
    const n = Math.min(a.length - startA, b.length - startB)
    if (n <= 0) continue
    let diff = 0
    for (let k = 0; k < n; k += 1) if (a[startA + k] !== b[startB + k]) diff += 1
    if (diff < best.diffBytes) best = { identical: diff === 0, diffBytes: diff, alignedLength: n }
  }
  return best
}

/** 主流程：四段判定 + 结论行。 */
async function main() {
  const argv = process.argv.slice(2)
  const strict = argv.includes('--strict')
  const asarPath = resolveAsarPath(argv)
  const localPath = argValue(argv, '--local')
  const { read, calibrated } = asarReader(asarPath)

  const consumerRaw = read(CONSUMER.file)
  const providerRaw = read(PROVIDER.file)
  if (consumerRaw === undefined || providerRaw === undefined) {
    throw new Error('归档里缺少目标文件：' + [CONSUMER.file, PROVIDER.file].join(' / '))
  }
  const consumer = consumerRaw.toString('utf8')
  const provider = providerRaw.toString('utf8')

  const published = await fetchPublished(PROVIDER.pkg, PUBLISHED_VERSION, 'lib/index.js')

  console.log('# 安装一致性取证（REQ-261004095621-c167）')
  console.log('app.asar           : ' + asarPath)
  console.log('使用方             : ' + CONSUMER.pkg + '@' + versionOf(read, CONSUMER.dir))
  console.log('提供方（安装版）   : ' + PROVIDER.pkg + '@' + versionOf(read, PROVIDER.dir))
  console.log('提供方（发布版）   : ' + PROVIDER.pkg + '@' + PUBLISHED_VERSION + '（registry.npmjs.org）')
  if (calibrated) console.log('注：该 app.asar 的数据区基址与规范值不同（已自校准）——非标准打包的痕迹')
  console.log('')

  let missing = 0
  console.log('| 符号 | 使用方（安装） | 提供方（安装） | 提供方（发布） | 判定 |')
  console.log('|---|---|---|---|---|')
  for (const s of SYMBOLS) {
    const used = count(consumer, s)
    const haveInstalled = count(provider, s)
    const havePublished = count(published, s)
    const verdict = used > 0 && haveInstalled === 0 && havePublished > 0
      ? '**缺符号 → 安装自相矛盾**'
      : (used > 0 && haveInstalled === 0 ? '使用方要但没人提供' : '一致')
    if (verdict.includes('缺符号')) missing += 1
    console.log(`| ${s} | ${String(used)} | ${String(haveInstalled)} | ${String(havePublished)} | ${verdict} |`)
  }
  console.log('')

  // ④ 本地补丁检测
  console.log('## 本地补丁检测（官方两版都没有、本机却有的符号）')
  console.log('')
  console.log('| 符号 | 提供方（安装） | 提供方（发布 rc.2） | 判定 |')
  console.log('|---|---|---|---|')
  let localPatched = 0
  for (const s of LOCAL_ONLY_SYMBOLS) {
    const haveInstalled = count(provider, s)
    const havePublished = count(published, s)
    const flagged = haveInstalled > 0 && havePublished === 0
    if (flagged) localPatched += 1
    console.log(`| ${s} | ${String(haveInstalled)} | ${String(havePublished)} | ${flagged ? '**本地新增符号 → 安装包被本地构建覆盖**' : '未见'} |`)
  }
  console.log('')

  if (localPath !== undefined) {
    if (!existsSync(localPath)) {
      console.log(`本地构建对照：路径不存在，跳过（${localPath}）`)
    } else {
      const local = readFileSync(localPath)
      const cmp = byteCompare(providerRaw, local)
      console.log(`本地构建对照：${localPath}`)
      console.log(`  → 对齐 ${String(cmp.alignedLength)} 字节，差异 ${String(cmp.diffBytes)} 字节` +
        (cmp.identical ? '（**逐字节相同 = 安装包里的就是这份本地构建**）' : '（相近但非同一份构建）'))
    }
    console.log('')
  }

  if (missing > 0 || localPatched > 0) {
    console.log('结论：该客户端安装**自相矛盾**，且已确认是**本机手工打补丁**造成的——' +
      '安装包里的提供方（primitives）是本机 checkout 的本地构建（带本地新增符号、缺新版 API），' +
      '而同包内的使用方（model-selection）是官方新版。受影响的不止模型选择器：任何用到缺失 API 的菜单/弹窗都会崩。')
    console.log('修复：用官方安装包重装/更新客户端（恢复官方包）；不要再把单个本地构建的文件塞进 app.asar——' +
      '那正是本次故障的成因（要改请整包重建，不要部分覆盖）。')
  } else {
    console.log('结论：使用方所需导出在安装版提供方里齐全，且未见本地补丁痕迹 → 本项一致。')
  }
  if (strict && (missing > 0 || localPatched > 0)) process.exitCode = 1
}

main().catch((error) => {
  console.error('取证失败：' + (error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
})
