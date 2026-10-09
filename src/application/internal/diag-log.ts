// REQ-f6307c T3：文件化诊断日志 —— 修复「诊断依赖 stdout，而 stdout 可能进了死管道」的观测面盲区。
//
// 背景（2026-09-21 T2 误诊复盘）：T2 依据「日志里看不到 capture hook registered」判定
// apply() 未执行，实为三重观测错误——①查错路径（~/Library/Logs 非 plist 配置路径）
// ②配置的 launchd.out.log 自 09-19 起停更（进程被外部 shell 手工拉起，未经 launchd）
// ③当前进程 stdout 指向已无读者的管道（start.sh | tail -5），所有 console/logger 输出蒸发。
// 教训：诊断日志必须落文件，禁止只依赖 stdout。
//
// REQ-261008020617-088f RF-4：本文件**只留门面**——时间戳与「控制台 + 文件双写」的策略在这里，
// 文件的轮转 / 追加 / 容错全部下沉到 `adapters/FileDiagSink`（application 不再 import node:fs）。
// 六个 application 调用点 `captureDiag(...)` **一字未改**：这正是留门面的价值（换实现不动调用方）。
//
// 形状不变（设计 INV-4）：append-only 文本，超 512KB 轮转为 .1（只保留一代，够用且零依赖）；
// 任何失败静默吞掉——诊断通道绝不能反过来影响主流程（对齐 isolation-trace 的容错设计）。

import type { DiagSinkPort } from '../ports.js';

/** 诊断日志的相对落点（组合根用 `dshHomePath(config, CAPTURE_DIAG_REL)` 解析成绝对路径）。 */
export const CAPTURE_DIAG_REL = 'state/reqboard-capture-diag.log';

/**
 * 当前 sink。**未装配 = 只进控制台**——与搬迁前 `diagFile === undefined` 的行为逐字一致
 * （那时也只 `console.log`），故"未装配"这条分支没有引入新语义。
 */
let diagSink: DiagSinkPort | undefined;

/** 组合根（index.ts apply）启动时调用一次，装上文件 sink（实现见 `adapters/FileDiagSink`）。 */
export function initCaptureDiag(sink: DiagSinkPort): void {
  diagSink = sink;
}

/** 写一条诊断：控制台 + sink 双写。控制台可能进死管道，文件才是可靠观测面。 */
export function captureDiag(message: string): void {
  const line = '[' + new Date().toISOString() + '] ' + message + '\n';
  // 文件优先（可靠面）。sink 实现本身也必须永不抛；这里再兜一层，双保险。
  if (diagSink !== undefined) {
    try {
      diagSink.write(line);
    } catch {
      /* 写失败静默——诊断不挡主流程 */
    }
  }
  // 控制台尽力而为（可能无人读，不判断也不抛）
  try {
    console.log(message);
  } catch {
    /* EPIPE 等静默 */
  }
}
