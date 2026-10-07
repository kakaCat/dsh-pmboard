import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';

/**
 * 测试进程的写入沙箱（REQ-261006201814-ac4f FR-5⑤-a）。
 *
 * ## 为什么用 Node 权限模型，而不是"改写 fs 导出"
 *
 * 第一版的设计是改写 `node:fs` 的导出以拦截仓内写入——实测**不可能**：
 * ESM 命名空间只读（`Cannot assign to read only property 'writeFileSync'`），
 * 且病灶（`vendor/reqboard/src/rtm/file-io.ts:11`）用的是**具名导入**。
 * 权限模型则是内核层拒绝，实测有效：写 `/tmp` 放行、写仓库内路径 `ERR_ACCESS_DENIED`。
 *
 * ## 版本差异（必须处理，否则在旧 Node 上静默失效）
 *
 * · Node 22+：`--permission`
 * · Node 20：`--experimental-permission`
 * 不支持时由 `tests/setup/hermetic-guard.ts` 的自检**响亮标注**为未覆盖，
 * 绝不当成"通过"。
 *
 * ## 放行范围（窄到刚好够用）
 *
 * 只放行**系统临时目录**（含 macOS 的 `/var` ↔ `/private/var` 软链两侧）与 `/tmp`。
 * 仓库内**一律不放行**——这正是本需求要守的那条线。
 */
// Node 的 SecurityWarning（--allow-child-process 触发）会污染**按行解析子进程输出**的既有用例。
// 在配置求值期就设进环境：forks worker 与它们再 spawn 的子进程都会继承（实测这条最可靠）。
process.env.NODE_NO_WARNINGS = '1'

const tmp = tmpdir();
const tmpReal = ((): string => {
  try {
    return realpathSync(tmp);
  } catch {
    return tmp;
  }
})();
const nodeMajor = Number(process.versions.node.split('.')[0] ?? '0');
const permissionFlag = nodeMajor >= 22 ? '--permission' : '--experimental-permission';
// Node 25 起**不接受**逗号分隔写法（会告警并按无效处理），必须重复 flag
const allowWrite = [...new Set([tmp, tmpReal, '/tmp', '/private/tmp'])];
const workerExecArgv = [
  permissionFlag,
  '--allow-fs-read=*',
  ...allowWrite.map(p => '--allow-fs-write=' + p),
  /**
   * **必须放行 spawn**（A/B 实测，见下）——否则会打红 26 条既有用例。
   *
   * 实测（2026-10-07，同一批 12 个文件）：「带沙箱」26 条失败 / 「去掉沙箱」0 条失败，
   * 差集 26 条全部落在需要起子进程的用例上：`typecheck`（spawn tsc）、
   * `migrate-ledger-v8v9`（真实 CLI 进程）、`kb-cli-parity` / `kb-coverage-probe`（kb CLI）、
   * `prompt-gates`（.mjs 脚本）、`queue/QueueRepository`（jq）、`skills-materialize`（python3 探测）、
   * `system-file-opener`、`archive-ledger-audit`、`legacy-board-route`、`header-progress-e2e`、
   * `reqboard/landing-failure-loud`。需求 D-9 是硬约束（**既有用例零语义变更**，只许加不许改），
   * 故不能靠改这 26 条判据来迁就沙箱。
   *
   * ## 已知残留洞（记录在案，不是遗忘）
   *
   * `--allow-child-process` 会让**非 Node 子进程**绕过权限模型：实测
   * `execSync('sh -c "echo x > <仓库内路径>"')` **写得进去**（Node 子进程会继承权限模型，实测被拒；
   * `sh` 不会）。这条洞由 `tests/hermetic-guard.test.ts` 显式钉住并注明。
   * 权衡：历史泄漏形态是**进程内 `writeFileSync`**（`vendor/reqboard` 的 RTM 写盘），
   * 那条路径仍被内核拒绝；「测试故意 shell 出去写仓」不是发生过的事故形态。
   */
  '--allow-child-process',
  /**
   * 放行**网络**：Node 25 起 `--permission` 也管网络（实测默认**拒绝 bind/listen**），
   * 而若干既有用例真的起本地 HTTP server 打端到端（如 `legacy-board-route` 的 HEAD/GET 契约）。
   * 不放行时表现为 `server.listen` 抛 `ERR_ACCESS_DENIED` / 用例 5s 超时（实测 2 条）。
   */
  '--allow-net',
  /**
   * 放行 **worker_threads**：`tsx` 的 transform 走 worker 线程，不放行时子进程直接抛
   * `Access to this API has been restricted. Use --allow-worker`（实测：kb 探针族 7 条 + 真 server 2 条）。
   * 与 `--allow-child-process` 同理——都是「既有用例本来就要用的能力」，不是放宽判据；
   * 权限模型在 worker 内同样生效（同一进程族）。
   */
  '--allow-worker',
  /**
   * 抑制 `--allow-child-process` 的 SecurityWarning：它会打到 **stderr**，
   * 而若干既有用例（kb 探针族）把子进程 stdout+stderr 合并后**按行解析读数**——
   * 一行警告就会让「K13 不在探针输出里」整片误红（实测 7 条）。
   * 这是**读数的噪声**问题，不是判据放宽：探针内容与解析口径一字未改。
   */
  '--no-warnings',
];

export default defineConfig({
  resolve: {
    alias: {
      // react 是本包的 external（运行时由 DSH web shell 的 module-loader seed 提供），
      // node_modules 里没有它——不映射时任何 import 到 page/host.ts 的用例会整文件失败。
      // 垫片只实现最小契约（见 tests/stubs/react.ts）。
      react: fileURLToPath(new URL('./tests/stubs/react.ts', import.meta.url)),
      // react-dom 同因（本包 external、node_modules 里没有）：`react-dom/server` 的静态渲染
      // 由 tests/stubs/react-dom-server.ts 垫（只有结构可断言的极简序列化，不是真 react-dom）。
      // 注意：别名是「整段相等或前缀 + '/'」匹配，故本条不会与上面的 `react` 互相截胡。
      'react-dom/server': fileURLToPath(new URL('./tests/stubs/react-dom-server.ts', import.meta.url)),
    },
  },
  test: {
    /**
     * 抑制 `--allow-child-process` 的 SecurityWarning **噪声**（不是放宽判据）：
     * 该警告由 Node 打到 stderr，而若干既有用例（kb 探针族、真 server 用例）会
     * **按行扫描子进程输出**找读数/就绪信号——多一行警告就让它们整片误红（实测 9 条）。
     * 用环境变量而不是 argv，是因为子进程继承 env；`NODE_NO_WARNINGS=1` 只关警告，
     * 不改任何判据、也不改权限范围。
     */
    env: { NODE_NO_WARNINGS: '1' },

    // 包含当前目录的 tests 文件
    include: ['tests/**/*.test.ts'],

    // 排除
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.vite/**',
      '**/.vitest/**'
    ],

    // 禁用缓存（调试用）
    cache: false,

    // 根目录
    root: process.cwd(),

    // 沙箱自检（每个 worker 启动时跑一次：真写一次仓内路径，看内核给不给过）
    setupFiles: ['tests/setup/hermetic-guard.ts'],

    // 把权限开关下发给 forks worker —— 这是 ⑤-a「真拦」的唯一开关
    poolOptions: {
      forks: {
        execArgv: workerExecArgv,
      },
    },
  }
});
