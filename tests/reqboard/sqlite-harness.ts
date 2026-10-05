/**
 * SQLite 实现的**契约夹具**（REQ-261004103330-005f t4）。
 *
 * ## 为什么单独一个文件
 *
 * `store-contract.test.ts` 的注册表要求每个实现自带夹具（分片实现用 `fake-shard-fs` 现搭、
 * 内存替身直接构造）。SQLite 的夹具需要"临时目录 + 建库 + 灌种子 + 用完删"，还有**跨用例的资源
 * 登记**——把它塞进契约文件会同时撑大那个文件并混进无关的 fs 细节，故独立成模块。
 *
 * ## 两条纪律（本文件存在的理由）
 *
 * 1. **每个实例一个独立临时目录**：契约套件每个 `it` 都会调一次 `make`，共用库文件会让并行/顺序
 *    用例互相污染（读到上一条用例留下的需求），那种失败极难归因。
 * 2. **用完必须删**：临时目录登记在模块级数组里，由契约文件在 `afterAll` 调
 *    {@link disposeSqliteHarnesses} 统一关库 + 删目录。不删就会在系统临时目录里留一堆库文件
 *    （实测一次契约运行会建几十个）。
 *
 * ## 关于故障注入
 *
 * 本夹具**刻意不提供** `injectFault`：与分片实现同口径——`CORRUPT_SHARD` / `IO_FAILED` 两条
 * 由分片实现的故障用例承担（端口注释明确允许）。契约文件里对该情况的既有惯例是
 * **用例内 console.log 显式说明后跳过**，不是静默跳过。
 *
 * @module tests/reqboard/sqlite-harness
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteRequirementStore } from '../../src/repositories/SqliteRequirementStore.js'
import type { ImportedLedger } from '../../src/application/ports.js'
import { REQBOARD_SCHEMA_VERSION, type RequirementRecord } from '../../src/shared/protocol.js'

/** 本进程内建过的临时目录与库（`afterAll` 统一清理）。 */
const tempDirs: string[] = []
const openStores: SqliteRequirementStore[] = []

/**
 * 造一个装着种子的临时库，返回与其它实现同形的夹具对象。
 *
 * 种子走端口的 `replaceAll`（**不是**绕过端口直写库表）：契约测试要证明的正是"端口可替换"，
 * 夹具若自己写库就绕开了端口，等于用实现细节喂实现。
 */
export async function makeSqliteHarness(seed: readonly RequirementRecord[]): Promise<{ store: SqliteRequirementStore }> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sqlite-contract-'))
  tempDirs.push(dir)
  const store = new SqliteRequirementStore({
    file: join(dir, 'reqboard.sqlite'),
    // 固定时钟：契约断言里有依赖 updatedAt 排序与 version 自增的用例，时间必须可复现。
    now: () => 100,
    // 告警不吞：契约测试不关心告警内容，但也不该把 console 弄脏。
    onWarn: () => { /* 契约不校验告警，静音 */ },
  })
  openStores.push(store)
  const ledger: ImportedLedger = {
    schemaVersion: REQBOARD_SCHEMA_VERSION,
    revision: 1,
    requirements: [...seed],
    triages: [],
  }
  await store.replaceAll('契约夹具种子', ledger)
  return { store }
}

/** 关掉全部库并删掉全部临时目录（契约文件的 `afterAll` 调用）。 */
export function disposeSqliteHarnesses(): void {
  for (const store of openStores.splice(0)) {
    try {
      store.close()
    } catch {
      /* 已关闭 / 关闭失败不掩盖原始用例结果 */
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** 当前登记的临时目录数（仅供自检/诊断，不参与断言）。 */
export function sqliteHarnessLeaks(): number {
  return tempDirs.length
}
