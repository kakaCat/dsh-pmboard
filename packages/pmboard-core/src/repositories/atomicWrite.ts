/**
 * 原子写（REQ-261002161439-277d · t3 / FR-2）——**全仓唯一的 temp + fsync + rename 实现**。
 *
 * ## 为什么要有这个文件
 *
 * `persistAtomic` 原本住在 `adapters/旧单册适配器（已删除）.ts` 里，被 7 处 import（队列仓储、三个
 * 日志适配器、迁移脚本、测试）。分片布局会让**写点变多**（每需求一个分片），把唯一实现钉在
 * "即将被删除的单册适配器"里就不成立了。本文件是它的新家，`旧单册适配器（已删除）` 在 t8 删除后
 * 原子写依然在这里。
 *
 * 本仓已经写死过这条纪律：**不造第二套原子写**——两套实现必然在"谁先 fsync、谁负责 mkdir、
 * 失败时 temp 残留"上漂移，而原子性是**断电才暴露**的性质，漂移不会在测试里露头。
 *
 * ## 相对原实现的一处行为修正（t3 卡上验收要求）
 *
 * 原实现在 `rename` 失败时**把临时文件留在盘上**（`tests/application/repository.test.ts` 原来
 * 正是这么断言的）。分片布局下写点变多，失败即泄漏一个 `.tmp`；t3 的验收明确要求
 * 「原子写失败不留半截目标文件、**临时文件被清理**」。故失败时 best-effort `unlink` 临时文件后
 * 再抛原错误——**错误本身一个字段都不改**（调用方看到的失败原因不变）。
 *
 * ## fs 能力可注入
 *
 * 默认走 `node:fs/promises`；测试注入假 fs 就能断言"rename 抛错时目标未被污染、临时文件被清理"，
 * 以及给 t5 的写/读放大探针挂字节计数器（不需要 mock 掉整个 fs 模块）。
 *
 * @module dsh-pmboard/repositories/atomicWrite
 */
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** 文件句柄的最小面（`persistAtomic` 真正用到的那三个方法）。 */
export interface AtomicFileHandle {
  writeFile(data: string, encoding: 'utf8'): Promise<void>
  sync(): Promise<void>
  close(): Promise<void>
}

/** 原子写所需的 fs 能力。 */
export interface AtomicFs {
  mkdir(path: string, opts: { recursive: true }): Promise<void>
  open(path: string, flags: 'w'): Promise<AtomicFileHandle>
  rename(from: string, to: string): Promise<void>
  /** 失败清理用（best effort；调用方不该因它失败而改变错误）。 */
  unlink(path: string): Promise<void>
}

/** 生产实现：`node:fs/promises`。 */
export const nodeAtomicFs: AtomicFs = {
  async mkdir(path, opts) {
    await mkdir(path, opts)
  },
  async open(path, flags) {
    const fh = await open(path, flags)
    return {
      writeFile: (data, encoding) => fh.writeFile(data, encoding),
      sync: () => fh.sync(),
      close: () => fh.close(),
    }
  },
  async rename(from, to) {
    await rename(from, to)
  },
  async unlink(path) {
    await unlink(path)
  },
}

/**
 * 原子写：写临时文件 → fsync → rename。
 *
 * 缺 fsync 时空断电可能留下零长文件（S10 教训）；同目录生成 dot 前缀临时名，是因为
 * **rename 在同一文件系统内是原子的**——目标要么是旧内容、要么是新内容，绝不会出现半截 JSON。
 *
 * 失败路径：清理临时文件（best effort）后**原样抛出**原错误。
 */
export async function persistAtomic(file: string, contents: string, fs: AtomicFs = nodeAtomicFs): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const temp = join(dirname(file), `.${Math.random().toString(36).slice(2)}.tmp`)
  try {
    const fh = await fs.open(temp, 'w')
    try {
      await fh.writeFile(contents, 'utf8')
      await fh.sync()
    } finally {
      await fh.close()
    }
    await fs.rename(temp, file)
  } catch (err) {
    try {
      await fs.unlink(temp)
    } catch {
      /* best effort：清理失败不能顶替原始错误（那会让调用方看到误导的原因） */
    }
    throw err
  }
}
