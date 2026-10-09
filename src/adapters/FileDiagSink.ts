/**
 * 诊断日志的文件 sink（REQ-261008020617-088f RF-4）——`DiagSinkPort` 的宿主实现。
 *
 * 从 `application/internal/diag-log` 原样搬出（形状逐字保留，设计 INV-4）：append-only 文本，
 * 超 512KB 轮转为 `.1`（只保留一代），**任何失败静默**——诊断通道绝不能反过来影响主流程。
 *
 * 落点由组合根决定（`dshHomePath(config, CAPTURE_DIAG_REL)`），与任何工作区根无关，
 * 故本类构造时收绝对路径，不做根推导。
 *
 * @module dsh-pmboard/adapters/FileDiagSink
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { DiagSinkPort } from '../application/ports.js'

/** 单文件上限（超过即轮转为 `.1`）。口径与搬迁前逐字一致。 */
const MAX_BYTES = 512 * 1024

export class FileDiagSink implements DiagSinkPort {
  private readonly file: string

  constructor(absPath: string) {
    this.file = absPath
    try {
      mkdirSync(dirname(absPath), { recursive: true })
    } catch {
      /* 目录创建失败不致命，写时会再试 */
    }
  }

  /** 追加一行。**永不抛**（端口契约）：轮转失败照写、写失败静默。 */
  write(line: string): void {
    try {
      const st = statSync(this.file)
      if (st.size > MAX_BYTES) {
        renameSync(this.file, this.file + '.1')
      }
    } catch {
      /* 不存在或 stat 失败 → 直接 append */
    }
    try {
      appendFileSync(this.file, line)
    } catch {
      /* 写失败静默——诊断不挡主流程 */
    }
  }
}
