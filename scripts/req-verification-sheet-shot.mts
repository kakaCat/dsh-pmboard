/**
 * 验收面板「逐项行」截图（REQ-261006092213-4f5b t5 · serves: FR-4 / FR-5）。
 *
 * 为什么需要图：本卡改的是**版面长相**（实际结果行、输入框预填、需人工旗标），
 * 字符串断言只能证明"属性在不在"，证明不了"人一眼能不能看出这条结果是谁跑的"。
 * 判据里明写要附实测截图（`design/test-cases.md` 人工验收证据一节），故真渲染 + 真 CSS + headless Chrome 出图。
 *
 * 用法：`npx tsx scripts/req-verification-sheet-shot.mts`
 * 产物：`docs/requirements/REQ-261006092213-4f5b/evidence/verification-sheet-1280.png`（2 倍图）
 *
 * 标本页与真实页共用**同一份 CSS**（`SPECIMEN_CSS`，顺序照 `src/client/styles.ts`）与
 * **同一个渲染器**（`renderStagePanel`），mock 数据只提供台账读数。
 * 仅截图用的 CSS 只有 body 的外边距与底色两条，已在页内注明——**绝不为图好看去改 `src/` 的样式**。
 *
 * 退出码：0 = 图出好了；1 = 图没出成或不像话（响亮失败）；2 = 找不到 Chrome（打修复指引）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SPECIMEN_CSS, findChrome } from './fixtures/req-detail-specimen.mts'
import { renderStagePanel } from '../src/client/stage-panel.js'
import type { StageDetail } from '../src/shared/protocol.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'docs', 'requirements', 'REQ-261006092213-4f5b', 'evidence')
const OUT = join(OUT_DIR, 'verification-sheet-1280.png')
const WIDTH = 1280
const SCALE = 2
const MIN_PNG_BYTES = 60 * 1024
/** 出图窗口高：比 fixture 的默认 800 高一些，让五条形态（含 needsHuman+result）全在首屏内。 */
const SHOT_HEIGHT = 1080

/** mock 验收单：四种形态各一行（有 agent 结果 / 人改过 / 需人工 / 无结果）。 */
function specimen(): StageDetail {
  const items = [
    {
      id: 'v2-1',
      source: { kind: 'task', taskId: 't-62130a' },
      criterion: '【提交侧逐项交代】验收：npx vitest run tests/accept-sheet-tool.test.ts → 25 passed',
      evidence: ['npx vitest run tests/accept-sheet-tool.test.ts → 25 passed'],
      status: 'pending',
      result: 'npx vitest run tests/accept-sheet-tool.test.ts → 25 passed（含 8 项新增）',
      resultSource: 'agent',
    },
    {
      id: 'v2-2',
      source: { kind: 'task', taskId: 't-8d3c5d' },
      criterion: '【看板通道口径】验收：留空点通过 → 200 且意见取该项实测结果',
      evidence: ['npx vitest run tests/verdicts-http.test.ts → 6 passed'],
      status: 'pending',
      result: '人工复跑：npx vitest run tests/verdicts-http.test.ts → 6 passed',
      resultSource: 'human',
    },
    {
      id: 'v2-3',
      source: { kind: 'prototype-compare', prototypePath: 'prototypes/verification-result.html' },
      criterion: '与原型对照截图（含差异说明）',
      evidence: ['docs/requirements/REQ-261006092213-4f5b/prototypes/verification-result.html#FR-4'],
      status: 'pending',
      needsHuman: true,
      humanReason: '界面视觉需人对照权威原型',
    },
    {
      // 复核点名的组合：needsHuman **且**有 result —— 不预填（判定依据在人眼里），但参照材料照常展示
      id: 'v2-3b',
      source: { kind: 'prototype-compare', prototypePath: 'prototypes/verification-result.html#FR-5' },
      criterion: '与原型对照截图（含差异说明）· 该项已有 agent 参照材料',
      evidence: ['docs/requirements/REQ-261006092213-4f5b/evidence/verification-sheet-1280.png'],
      status: 'pending',
      result: 'agent 参照材料：看板逐项行截图已出（agent 未自动验证视觉一致性）',
      resultSource: 'agent',
      needsHuman: true,
      humanReason: '界面视觉需人对照权威原型',
    },
    {
      id: 'v2-4',
      source: { kind: 'requirement' },
      criterion: '需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）',
      evidence: ['npx vitest run 全量 → 68 failed ≤ 基线 106'],
      status: 'pending',
    },
  ]
  return {
    stage: 'accepting',
    enabled: true,
    // 验收材料产物行别显示成红色的「缺失」——那是标本数据缺口，不是本图要表达的界面状态。
    artifacts: [{
      stage: 'accepting', kind: 'verification',
      path: 'docs/requirements/REQ-261006092213-4f5b/verification.md',
      registeredAt: 1, registeredBy: { kind: 'agent', sessionId: 'session-851897de' },
    }],
    pendingConfirmation: false,
    timeline: [],
    requirementId: 'REQ-261006092213-4f5b',
    body: {
      verification: {
        summary: '逐项实测结果由 agent 落章，人只做裁决（本图：看板逐项行）',
        evidence: ['npx vitest run 全量 → 68 failed ≤ 基线 106'],
        sheet: { version: 2, items },
      },
    },
  } as unknown as StageDetail
}

function pngSize(path: string): { w: number; h: number } | undefined {
  const head = readFileSync(path).subarray(0, 24)
  if (head.length < 24 || head.readUInt32BE(0) !== 0x89504e47 || head.readUInt32BE(4) !== 0x0d0a1a0a) return undefined
  return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) }
}

function main(): void {
  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('SHOT FAIL（环境不可用，退出码 2）：找不到 Chrome。设置 CHROME_BIN 或安装 Google Chrome。')
    process.exit(2)
  }
  mkdirSync(OUT_DIR, { recursive: true })
  const panel = renderStagePanel(specimen(), {})
  // 出图前的**内容**判据（复核 S5）：原先只看 PNG 字节数，实测纯白空页也有 15568 B
  // ⇒ 渲染器整块返回空串也会"通过"。这里先断言四种形态真的进了串，再落图。
  const MUST = ['is-prefilled', '实际结果（人工填写）', '需人工确认：界面视觉需人对照权威原型', '尚无实测结果']
  const missed = MUST.filter(k => !panel.includes(k))
  if (missed.length > 0) {
    console.error('SHOT FAIL：渲染串缺少关键形态 ' + missed.join('、') + '（渲染器可能没出内容）')
    process.exit(1)
  }
  const page = [
    '<!doctype html><html lang="zh"><head><meta charset="utf-8">',
    '<title>pmboard 验收面板逐项行（REQ-261006092213-4f5b t5）</title>',
    `<style>${SPECIMEN_CSS}</style>`,
    // 仅样品页：真实页面由宿主容器给外边距与底色，标本页没有容器，故补这两条。
    '<style>html,body{margin:0;background:var(--dsw-bg-primary,#fff)}.shot-wrap{max-width:880px;margin:0 auto;padding:20px}</style>',
    '</head><body><div class="shot-wrap">', panel, '</div></body></html>',
  ].join('')
  const dir = mkdtempSync(join(tmpdir(), 'pm-vsheet-shot-'))
  const html = join(dir, 'sheet.html')
  writeFileSync(html, page)
  rmSync(OUT, { force: true })
  try {
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      `--force-device-scale-factor=${String(SCALE)}`,
      '--no-first-run', '--no-default-browser-check',
      '--run-all-compositor-stages-before-draw',
      `--window-size=${String(WIDTH)},${String(SHOT_HEIGHT)}`,
      `--screenshot=${OUT}`, `file://${html}`,
    ], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    console.error('SHOT FAIL：Chrome 出图失败 — ' + (e as Error).message.split('\n')[0]!.slice(0, 200))
    process.exit(1)
  }
  if (!existsSync(OUT)) { console.error('SHOT FAIL：截图文件没生成 ' + OUT); process.exit(1) }
  const bytes = statSync(OUT).size
  const px = pngSize(OUT)
  if (bytes < MIN_PNG_BYTES || px === undefined || px.w !== WIDTH * SCALE) {
    console.error(`SHOT FAIL：图不像话（bytes=${String(bytes)} size=${JSON.stringify(px)} 期望宽 ${String(WIDTH * SCALE)}）`)
    process.exit(1)
  }
  console.log(`OK  ${OUT}  ${String(px.w)}x${String(px.h)}  ${String(bytes)} bytes`)
}

main()
