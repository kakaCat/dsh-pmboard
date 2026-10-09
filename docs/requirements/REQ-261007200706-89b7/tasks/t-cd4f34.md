# t-cd4f34 扩展 prompt-path-probe 扫描面与禁词前缀并挂 prompts:check·联调

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
扩展 prompt-path-probe 扫描面与禁词前缀并挂 prompts:check·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/prompt-path-probe-tools-surface.test.ts` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T13:21:45.518Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

联调通过：prompts:check 三段 exit 0；真实仓负例注入两条指针均判红点名；旧 fragments 面 token 集合完整保留

### 完成项

- 端到端接线：pnpm prompts:check（三段：inline-prompt-fragments + check-prompt-fragments + prompt-path-probe）exit 0，探针段输出 OK 禁词命中 0
- 新扫描面真实负例（非合成）：新建 src/tools/__probe_negative_tmp.ts 注入 templates/probe-negative-missing.md 与 agent-dh/docs/... 两个指针 → 探针 exit 1 且两条都逐一点名（文件:行 正确指向 :1）；删除该文件 → exit 0。证明扩出来的面真的被扫、禁词规则在真实仓生效
- 既有面不回归（A/B）：HEAD 版探针 57 片段 + round-state → 20 token / 0 缺口；新版同一面 token 集合是 20 的全集子集（差集为空），新增缺口 0——旧面结果完整保留
- 行号保真复核：注入文件报出的 src/tools/__probe_negative_tmp.ts:1 与原文一致（块注释换行数保留，未整体前移）

### 改动文件

- `scripts/prompt-path-probe.mts`
- `package.json`

### 下一步

复核子卡：对着 design/architecture.md 的探针契约逐条核对

---
