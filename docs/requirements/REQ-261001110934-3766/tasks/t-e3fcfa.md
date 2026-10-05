# t-e3fcfa 写生成器 kb-build（代码地图 + 设计令牌 + 漂移门禁）·联调

> 需求：REQ-261001110934-3766 代码知识库能力调研：降 token + 快速理解项目

## 在做什么
写生成器 kb-build（代码地图 + 设计令牌 + 漂移门禁）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npm run kb:check → 退出码 0（先 kb-build --check 零漂移，再 kb-probe 九项全过）

## 汇报 1（2026-10-01T04:43:56.138Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

生成器与门禁串成一条命令：`pnpm run kb:check` 一条命令答「生成物跟得上代码吗、知识层还健康吗」，忘了重生成会被当场拦住。

### 完成项

- 与自检串联：kb-probe 的 K7 内部调 kb-build --check → 漂移即失败（单一事实源，不重写比较逻辑）
- 与门禁串联：package.json 增 kb:build / kb:check / kb:probe，kb:check = 生成物零漂移 + 九项自检
- 实测：npm run kb:check 退出码 0；改源码不重生成 → 非零退出（真实演练过 4 处漂移）

### 改动文件

- `package.json`
- `scripts/kb-probe.mts`

### 下一步

复核：确定性口径与预算边界

---
