#!/usr/bin/env node
/**
 * 源/产物同步门禁（REQ-422af1 t2，门禁 6；t7 追加 vendor 镜像检查）——
 * fragments/**.md 或 vendor 原文改了没重跑生成器/没同步镜像即 exit 1。
 *
 * 口径：
 *   ① 内存重新生成整份 TS 源码，与磁盘上的 generated/fragments.ts **逐字节**比对；
 *   ② VENDOR_MAIN_SKILLS 映射内的 fragments/<stage>/heavy.md 必须与
 *      vendor/superpowers/<skill>/SKILL.md **逐字节**一致（防镜像漂移）；
 *      brainstorming / design / decomposing 的 heavy 为本仓自写完整档，不在镜像口径内。
 * 不一致 / 产物缺失 → 打印原因 → exit 1（响亮失败，不静默通过）。
 * 用法：node scripts/check-prompt-fragments.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import {
  buildFragmentsSource,
  buildTypeFragmentsSource,
  vendorMirrorProblems,
  GENERATED_FILE,
  GENERATED_REL,
  TYPE_FRAGMENTS_FILE,
  TYPE_FRAGMENTS_REL,
  CATEGORIES,
} from './inline-prompt-fragments.mjs'

const vendorProblems = vendorMirrorProblems()
if (vendorProblems.length > 0) {
  console.error('[check-prompt-fragments] FAIL: heavy.md ↔ vendor 原文不一致：')
  for (const p of vendorProblems) console.error('  - ' + p)
  console.error('  请把 vendor/superpowers/<skill>/SKILL.md 原样复制为 fragments/<stage>/heavy.md（逐字节）')
  process.exit(1)
}

const expected = buildFragmentsSource()
if (!existsSync(GENERATED_FILE)) {
  console.error('[check-prompt-fragments] FAIL: 产物不存在，请先跑 node scripts/inline-prompt-fragments.mjs')
  process.exit(1)
}
const actual = readFileSync(GENERATED_FILE, 'utf8')
if (actual !== expected) {
  const at = [...expected].findIndex((ch, i) => ch !== actual[i])
  console.error('[check-prompt-fragments] FAIL: ' + GENERATED_REL + ' 与 fragments/**.md 不一致（首个差异偏移 ' + at + '）')
  console.error('  expected ' + expected.length + ' bytes / actual ' + actual.length + ' bytes')
  console.error('  源或产物被单独改过——请重跑 node scripts/inline-prompt-fragments.mjs')
  process.exit(1)
}
/**
 * 按类型条数基线（REQ-261009174713-7bc8 RF-27）：**通用 21 条 + 六类型各 18 条 = 129**。
 *
 * 为什么这条也要门禁：片段劣化的表现不是报错，而是**静默少几条**（提示词变薄、agent 漏掉某步），
 * 靠人看是看不出来的。故把条数冻在这里：某类型的条数一变就 exit 1 并点名是哪个类型、少了几条。
 * 改这个常量 = 明确承认「提示词内容变了」，必须与 tests/fixtures/stage-prompts-baseline-p1.json 同步。
 */
const EXPECTED_COUNTS = { '*': 21, feature: 18, bug: 18, doc: 18, refactor: 18, spike: 18, chore: 18 }

/** 从产物源码里逐条数出 category（只用生成器自己写出来的固定字段序，不做模糊匹配）。 */
function countByCategory(source) {
  const out = new Map()
  const re = /\{ id: "([^"]+)", stage: "[^"]+", difficulty: "[^"]+", category: "([^"]+)"/g
  for (const m of source.matchAll(re)) out.set(m[2], (out.get(m[2]) ?? 0) + 1)
  return out
}

// 条数口径（t11 二期）：**按文件**数——通用在 common 产物里（且必须只有 category=*），
// 每一类在自己的类型包产物里。任一文件里的 category 集合跑偏都会被下面的基线断言抓住。
const counts = countByCategory(actual)
for (const cat of CATEGORIES) {
  const perType = countByCategory(readFileSync(TYPE_FRAGMENTS_FILE(cat), 'utf8'))
  if (perType.size !== 1 || !perType.has(cat)) {
    console.error('[check-prompt-fragments] FAIL: ' + TYPE_FRAGMENTS_REL(cat) + ' 里出现了非本类型的 category：' + [...perType.keys()].join(','))
    process.exit(1)
  }
  counts.set(cat, perType.get(cat))
}
const countProblems = []
for (const [cat, want] of Object.entries(EXPECTED_COUNTS)) {
  const got = counts.get(cat) ?? 0
  if (got !== want) countProblems.push(`${cat === '*' ? '通用' : cat}：期望 ${want} 条，实际 ${got} 条`)
}
for (const cat of counts.keys()) {
  if (!(cat in EXPECTED_COUNTS)) countProblems.push(`出现基线外的类型：${cat}（${counts.get(cat)} 条）`)
}
if (countProblems.length > 0) {
  console.error('[check-prompt-fragments] FAIL: 片段条数与基线不符（条数变化不是小事——少一条即提示词劣化）：')
  for (const p of countProblems) console.error('  - ' + p)
  console.error('  若是刻意增删片段：请同步更新本脚本的 EXPECTED_COUNTS 基线，并核对 tests/fixtures/stage-prompts-baseline-p1.json')
  process.exit(1)
}
const countText = ['通用 ' + counts.get('*')]
for (const cat of ['feature', 'bug', 'doc', 'refactor', 'spike', 'chore']) countText.push(cat + ' ' + counts.get(cat))

// 六份类型档（t11 二期）：与通用文件同款逐字节比对——类型档也必须由生成器说了算。
for (const cat of CATEGORIES) {
  const file = TYPE_FRAGMENTS_FILE(cat)
  const rel = TYPE_FRAGMENTS_REL(cat)
  const want = buildTypeFragmentsSource(cat)
  if (!existsSync(file)) {
    console.error('[check-prompt-fragments] FAIL: 类型档产物不存在：' + rel + '（请重跑 node scripts/inline-prompt-fragments.mjs）')
    process.exit(1)
  }
  const got = readFileSync(file, 'utf8')
  if (got !== want) {
    console.error('[check-prompt-fragments] FAIL: ' + rel + ' 与 fragments/**.md 不一致（类型档被单独改过）')
    process.exit(1)
  }
}

console.log('[check-prompt-fragments] OK: ' + GENERATED_REL + ' 与 fragments/**.md 一致；heavy.md ↔ vendor 原文逐字节一致')
console.log('[check-prompt-fragments] 条数基线：' + countText.join(' · '))
