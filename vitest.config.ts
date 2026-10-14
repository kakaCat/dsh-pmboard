import { defineConfig } from 'vitest/config';
import { alias, sharedTest } from './vitest.base.mts';

/**
 * 仓库根配置：只负责「扫哪些文件」这一件根专属的事。
 *
 * 沙箱 argv（Node 权限模型）、路径别名、`setupFiles`、`env`、`exclude`、`cache`、
 * `poolOptions` 全部来自 `vitest.base.mts` —— 根与各包**同一份事实源**，
 * 避免各包自跑时隔离纪律静默降级（2026-10-11 Phase 1）。
 */
export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    ...sharedTest,

    // 包含当前目录的 tests 文件（各包自跑时用自己的配置，只看自己的 tests/**）
    include: ['tests/**/*.test.ts', 'pm-*/tests/**/*.test.ts', 'category/*/tests/**/*.test.ts', 'tool-pm/tests/**/*.test.ts', 'goal/pm-goal/tests/**/*.test.ts', 'goal/pm-goal-round-driver/tests/**/*.test.ts', 'goal/tool-pm-goal/tests/**/*.test.ts', 'workprocess/*/tests/**/*.test.ts', 'command-pm/tests/**/*.test.ts', 'reqboard-rtm/tests/**/*.test.ts'],

    // 根目录
    root: process.cwd(),
  }
});
