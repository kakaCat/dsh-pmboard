# t-ebd43f 端到端复验与证据归档（真实 GUI + 探针 + 门禁）·研发

> 需求：REQ-261001101739-25c6 修复流程节点刷新后样式全丢（样式表归属）

## 在做什么
端到端复验与证据归档（真实 GUI + 探针 + 门禁）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx tsx scripts/header-progress-probe.mts → 末行 PROBE PASS（exit 0）；ls docs/requirements/REQ-261001101739-25c6/evidence/ → 含 header-flow-compare.png、header-flow-broken.png、header-flow-fixed.png、header-flow-after-hmr.png、README.md

## 汇报 1（2026-10-01T03:01:03.916Z，窗口 session-96ee4e52-6798-4e5b-b3a3-946152bfaf2a）

证据齐了：故障长什么样、修复后长什么样、热替换后长什么样，四张截图 + 一份可自己复跑的步骤留在了需求目录里。

### 完成项

- 证据归档：docs/requirements/REQ-261001101739-25c6/evidence/ 下四张截图（compare / broken / fixed / after-hmr）+ README（含 DevTools 复刻片段与契约出处）
- 真实 GUI 四条：归属章 dsh-pmboard、别的插件认领+删除后本表存活、删表 18s 内自愈、HMR remove→5ms→append
- 几何探针：npx tsx scripts/header-progress-probe.mts → 六档 problems=NONE + PROBE PASS；构建：pnpm build:client exit 0

### 改动文件

- `docs/requirements/REQ-261001101739-25c6/evidence/README.md`
- `docs/requirements/REQ-261001101739-25c6/evidence/header-flow-compare.png`
- `docs/requirements/REQ-261001101739-25c6/evidence/header-flow-fixed.png`
- `docs/requirements/REQ-261001101739-25c6/evidence/header-flow-broken.png`
- `docs/requirements/REQ-261001101739-25c6/evidence/header-flow-after-hmr.png`

---
