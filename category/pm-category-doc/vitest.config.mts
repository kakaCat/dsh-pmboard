import { defineConfig } from 'vitest/config'
import { alias, sharedTest } from '../../vitest.base.mts'

/**
 * 包内自跑配置：只声明「本包扫哪些文件」，隔离/别名/沙箱全部继承共享基座
 * （见 ../../vitest.base.mts 头注：各包各抄一份会让隔离纪律静默降级）。
 *
 * 用法：`cd category/pm-category-doc && pnpm test`（脚本 = `vitest run`）。
 */
export default defineConfig({
  resolve: { alias },
  test: {
    ...sharedTest,
    include: ['tests/**/*.test.ts'],
  },
})
