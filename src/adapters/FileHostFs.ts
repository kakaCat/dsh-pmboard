/**
 * 宿主文件面端口实现（REQ-261008020617-088f RF-3 / RF-5 · design/architecture.md §接口与数据契约变更）。
 *
 * 收编此前散在 `application/internal/rtm-health`（`node:fs` 同步读 + 写 state JSON）与
 * 两个用例（`statSync` 判目录、`process.cwd()`）的宿主 I/O。**无状态**：所有方法由调用方传根
 * ——`HostFsPort` 的注释里写了为什么不能把根绑进构造期（`docs/architecture/gate-read-root.md`
 * 的两次误拦事故）。因此它在组合根与 HTTP 路由里都可以直接 `new`，不持有任何装配参数。
 *
 * 容错口径与 `FileDocRepository` 对齐：读不到 = `undefined` / `false`（不抛，调用方按「判不了」处理）；
 * **写失败照实抛**，降级口径由调用方定。
 *
 * @module dsh-pmboard/adapters/FileHostFs
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import type { HostFsPort } from '../application/ports.js'

/** state 目录相对根的固定段——**端口契约的一部分**，改它等于改 state 文件落点。 */
const STATE_SEGMENTS: readonly string[] = ['.dsh-data', 'state']

/** 绝对路径原样返回，相对路径按根解析（与 `FileDocRepository.resolve` 同口径）。 */
function resolveUnder(root: string, relPath: string): string {
  return isAbsolute(relPath) ? relPath : join(root, relPath)
}

/** `<root>/.dsh-data/state/<name>` 的绝对路径。 */
function statePath(root: string, name: string): string {
  return join(root, ...STATE_SEGMENTS, name)
}

export class FileHostFs implements HostFsPort {
  /** 宿主进程 cwd（**不是**任何需求的根——见端口注释）。 */
  cwd(): string {
    return process.cwd()
  }

  isDirectory(absPath: string): boolean {
    if (typeof absPath !== 'string' || absPath.length === 0) return false
    try {
      return statSync(absPath).isDirectory()
    } catch {
      // 不存在 / 无权限 / 是文件 → 一律 false（调用方据此报「目录不存在或不可读」）
      return false
    }
  }

  exists(root: string, relPath: string): boolean {
    return existsSync(resolveUnder(root, relPath))
  }

  existsAbs(absPath: string): boolean {
    try {
      return existsSync(absPath)
    } catch {
      return false
    }
  }

  readText(root: string, relPath: string): string | undefined {
    try {
      return readFileSync(resolveUnder(root, relPath), 'utf-8')
    } catch {
      return undefined
    }
  }

  readStateJson(root: string, name: string): unknown | undefined {
    try {
      return JSON.parse(readFileSync(statePath(root, name), 'utf-8')) as unknown
    } catch {
      // 不存在 / 坏 JSON → undefined（与搬迁前「读不回 → 空数组」的调用方口径一致，判定留给调用方）
      return undefined
    }
  }

  writeStateJsonAtomic(root: string, name: string, data: unknown): void {
    const path = statePath(root, name)
    // 目录按需创建：state 目录可能还没被别的写者建出来，而留痕是旁路写入、不该因此丢证据。
    mkdirSync(dirname(path), { recursive: true })
    const tmp = path + '.tmp-' + String(process.pid) + '-' + String(Date.now())
    try {
      writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
      renameSync(tmp, path)
    } catch (err) {
      if (existsSync(tmp)) {
        try {
          unlinkSync(tmp)
        } catch {
          /* 清理失败不覆盖主错误 */
        }
      }
      throw err
    }
  }
}
