import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // react 是本包的 external（运行时由 DSH web shell 的 module-loader seed 提供），
      // node_modules 里没有它——不映射时任何 import 到 page/host.ts 的用例会整文件失败。
      // 垫片只实现最小契约（见 tests/stubs/react.ts）。
      react: fileURLToPath(new URL('./tests/stubs/react.ts', import.meta.url)),
    },
  },
  test: {
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
  }
});
