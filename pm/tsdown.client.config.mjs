import { defineConfig } from 'tsdown'

// Client-half bundle config. Plain .mjs on purpose (see tsdown.config.mjs).
//
// react is EXTERNAL (served by the DSH shell's module-loader seed). Any bare
// npm package imported by client code MUST be bundled — the shell's seed map
// holds ONLY react/react-dom/.../@deepseek-ai/* (see staticModules in
// @deepseek-ai/dsh-web-frontend), nothing a plugin registers makes a bare
// package resolvable at runtime. 2026-09-16: shipping 'marked' external broke
// the whole client half — "require(\"marked\") missed the module table".
//
// 2026-09-20: this plugin is fully self-contained (no bare npm imports in
// src/client/) — keep it that way; think twice before adding any import.
//
// ★ 同上（见 tsdown.config.mjs）：workspace 组件包必须内联。它们 exports 指向
// `./src/*.ts`（无构建产物），留成外部依赖 → 运行时 require('pm-core/...') 解析到
// 不存在的 src/*.js → 客户端半整体加载失败（2026-10-10 实测产物里出现
// `require("pm-core/domain/status/Predicates.js")` 一类裸说明符）。
const WORKSPACE_PACKAGES = [/^pm-/, /^tool-pm/, /^command-pm/, /^reqboard-rtm/]

export default defineConfig({
  entry: { client: '../pm-client/src/index.ts' },
  format: ['cjs'],
  outDir: 'lib',
  clean: false,
  sourcemap: false,
  external: ['react', 'react/jsx-runtime'],
  noExternal: WORKSPACE_PACKAGES,
  target: 'chrome120',
  minify: true,
  outExtensions: () => ({ js: '.cjs' }),
})
