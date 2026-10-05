#!/usr/bin/env node
/**
 * 存量任务卡「条款引用」回填 CLI（REQ-261002164800-d8f2 t6 / FR-5）。
 *
 * 用法（经 tsx）：
 *   pnpm tsx scripts/backfill-task-refs.ts --dry-run            # 只算不写（缺省）
 *   pnpm tsx scripts/backfill-task-refs.ts --apply --report <path>
 *   pnpm tsx scripts/backfill-task-refs.ts --check               # 复核：还剩多少该补没补
 *   pnpm tsx scripts/backfill-task-refs.ts --restore <报告.json>  # 按 before 还原
 *
 * 可选：`--ledger <path>`（台账文件，缺省 ~/.dsh/dsh-reqboard.json）、`--root <dir>`（工作区根，缺省 cwd）、
 *       `--json`（只输出机器可读报告）。
 *
 * 纪律：只经 TaskStore 与 DocsReader 两个端口；只补不覆写；`--apply` 必须显式声明（缺省 dry-run）。
 *
 * @module dsh-pmboard/scripts/backfill-task-refs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { JsonLedgerRepository } from '../src/adapters/JsonLedgerRepository.js'
import { JsonQueueRepository } from '../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SystemClock } from '../src/adapters/SystemClock.js'
import {
  applyBackfill,
  checkBackfill,
  planBackfill,
  restoreBackfill,
  type BackfillReport,
} from '../src/application/internal/backfill-task-refs.js'
import type { UseCaseDeps } from '../src/application/ports.js'

interface Args {
  mode: 'dry-run' | 'apply' | 'check' | 'restore'
  ledger: string
  root: string
  report: string
  restoreFrom?: string
  json: boolean
}

function parseArgs(argv: readonly string[]): Args {
  const has = (f: string): boolean => argv.includes(f)
  const valueOf = (f: string): string | undefined => {
    const i = argv.indexOf(f)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const root = resolve(valueOf('--root') ?? process.cwd())
  const mode: Args['mode'] = has('--apply') ? 'apply' : has('--check') ? 'check' : has('--restore') ? 'restore' : 'dry-run'
  return {
    mode,
    ledger: resolve(valueOf('--ledger') ?? join(homedir(), '.dsh', 'dsh-reqboard.json')),
    root,
    report: resolve(valueOf('--report') ?? join(root, 'docs', 'requirements', 'backfill-task-refs-report.json')),
    ...(valueOf('--restore') === undefined ? {} : { restoreFrom: resolve(valueOf('--restore') as string) }),
    json: has('--json'),
  }
}

/** 组合真实依赖（与插件装配同款端口；不直接读写队列文件）。 */
function buildDeps(args: Args): UseCaseDeps {
  const repo = new JsonLedgerRepository({ file: args.ledger })
  const docs = new FileDocRepository({ workspaceRoot: args.root })
  const queueRepo = new JsonQueueRepository({ workspaceRoot: args.root })
  const taskStore = new QueueTaskStore({ repo: queueRepo })
  const ids = new RandomIdFactory()
  return {
    repo: repo as never,
    docs: docs as never,
    taskStore: taskStore as never,
    ids: ids as never,
    clock: new SystemClock(),
  } as never as UseCaseDeps
}

function printReport(r: BackfillReport, args: Args): void {
  if (args.json) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n')
    return
  }
  const lines: string[] = []
  lines.push('=== 条款引用回填报告 ===')
  lines.push('模式：' + (r.dry_run ? 'dry-run（未写盘）' : 'apply（已写盘）'))
  lines.push('需求数：' + r.requirements.length)
  lines.push('候选（该补的卡）：' + r.totals.candidates)
  lines.push('已写：' + r.totals.applied)
  lines.push('无来源（文档表没写）：' + r.totals.unresolved)
  lines.push('跳过（子卡 / 已有引用 / 归档）：' + r.totals.skipped)
  lines.push('empty_with_doc_coverage: ' + r.empty_with_doc_coverage)
  const withCand = r.requirements.filter(p => p.candidates.length > 0)
  if (withCand.length > 0) {
    lines.push('--- 逐需求（仅列有候选者）---')
    for (const p of withCand) {
      lines.push(fmtLine(p.requirement_id, p.status, p.candidates.length, p.unresolved.length, p.skipped.length))
    }
  }
  process.stdout.write(lines.join('\n') + '\n')
}

function fmtLine(id: string, status: string, cand: number, unresolved: number, skipped: number): string {
  return `${id} [${status}] 候选 ${cand} / 无来源 ${unresolved} / 跳过 ${skipped}`
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const deps = buildDeps(args)
  // 台账是**懒加载**的（与插件装配一致）：不先 load，snapshot() 会给出空库（实测踩过：需求数 0）
  await (deps.repo as unknown as { load: () => Promise<void> }).load()

  if (args.mode === 'check') {
    const { empty_with_doc_coverage } = await checkBackfill(deps)
    process.stdout.write('empty_with_doc_coverage: ' + empty_with_doc_coverage + '\n')
    return
  }

  if (args.mode === 'restore') {
    if (args.restoreFrom === undefined) throw new Error('--restore 需要一个报告文件路径')
    const report = JSON.parse(readFileSync(args.restoreFrom, 'utf8')) as BackfillReport
    const { restored } = await restoreBackfill(deps, report)
    process.stdout.write('已按报告 before 值还原 ' + restored + ' 张卡\n')
    return
  }

  const plan = await planBackfill(deps)
  if (args.mode === 'dry-run') {
    // dry-run 也落一份报告（便于人复核候选明细；报告本身不是数据变更）
    writeFileSync(args.report, JSON.stringify(plan, null, 2), 'utf8')
    printReport(plan, args)
    process.stdout.write('报告：' + args.report + '\n')
    return
  }

  const applied = await applyBackfill(deps, plan)
  writeFileSync(args.report, JSON.stringify(applied, null, 2), 'utf8')
  printReport(applied, args)
  process.stdout.write('报告（含 before，可 --restore）：' + args.report + '\n')
}

main().catch((err: unknown) => {
  process.stderr.write('回填失败：' + ((err as Error).message ?? String(err)) + '\n')
  process.exitCode = 1
})
