import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

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
