import { defineConfig } from 'tsdown'

// Host-half (server) build. Published DSH plugins load from compiled output,
// so the package ships dist/index.mjs instead of raw TypeScript sources.
// Plain .mjs config on purpose: tsdown's TS config loading hits a known
// Node.js bug on some versions; .mjs loads natively everywhere.
// @deepseek-ai/cordis and @deepseek-ai/dsh-tools stay external — provided by
// the DSH host runtime. Inlining dsh-tools bundles a second copy of its
// module-level scheduler Symbol, which breaks tool dispatch at runtime.
//
// ★ workspace 组件包必须**内联**（noExternal）。它们的 package.json exports 指向
// `./src/*.ts`（无 dist 构建产物）；一旦被当成外部依赖留在产物里，运行时 Node 会按
// exports 解析到 `.../src/*.js`（不存在）→ 插件整体加载失败（2026-10-10 实测：
// `Cannot find module '.../pm/node_modules/pm-core/src/application/query/index.js'`）。
// 拆分前所有 import 都是包内相对路径（单包 → 自动内联），故这里把 workspace 包装回来，
// 产出自包含 —— 与拆分前的形态等价，且 17 个组件包**无需各自构建**。
// 注意：只有本仓 workspace 包（pm-* / tool-pm* / command-pm / reqboard-rtm）进内联，
// 真正的 npm 包（yaml 等）与宿主包（@deepseek-ai/*）仍走外部。
const WORKSPACE_PACKAGES = [
  /^pm-/,           // pm-core / pm-common / pm-goal / pm-goal-round-driver / pm-client / pm-category-* …
  /^tool-pm/,       // tool-pm / tool-pm-goal
  /^command-pm/,
  /^reqboard-rtm/,
]

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  dts: true,
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools'],
  noExternal: WORKSPACE_PACKAGES,
  target: 'node20',
  minify: false,
})
