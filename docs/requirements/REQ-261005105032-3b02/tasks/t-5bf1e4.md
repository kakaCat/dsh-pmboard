# t-5bf1e4 核对存量兼容（加性零迁移 / RTM 缺节 pending / legacy 豁免）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
核对存量兼容（加性零迁移 / RTM 缺节 pending / legacy 豁免）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/compat-regression.test.ts 全绿：全量读取存量 docs/requirements/*/rtm-*.yml 零异常；缺节标本读出 pending；旧台账分片缺三个新键时读取路径不报错且不产生写回（git status 无旧分片改动）；存量需求走新门禁 → 放行；存量健康检查 → exempted: legacy 且不判不健康；本轮未新增任何迁移脚本（git status 无 migrate-* 新文件）。

## 实施方案（implementation）
对本仓存量需求与 8 条 archived 做核对与补齐判据，不加迁移脚本、不改写旧数据：① 断言三个新键（StageArtifact.prototypeMeta?、TaskRecord.prototypeRefs?、decisionRefs?）在旧分片缺键时读取不报错、值为未采集 undefined，只有写侧才带新键（口径 = 加性变更、零迁移）；② 断言 vendor/reqboard/src/rtm/validator.ts 对缺 prototypes/decisions 节与含未知 key 的旧 YAML 读出 pending 且不判损坏；③ 断言 src/application/internal/rtm-health.ts 的适用性判据下存量一律 exempted: legacy、不被判不健康；④ 断言新门对 req.artifacts 为空的存量/直种需求放行（isLegacy 与既有两个门同口径），已归档需求不被追溯拒绝、不回填原型与 frontend.md。跑法固化为 npx vitest run tests/compat-regression.test.ts tests/rtm-health-legacy.test.ts 加一次对存量目录的全量读取（读全部 docs/requirements/*/rtm-*.yml 不抛）。依据 design-brief §5 兼容基线与 §10 #19/#50。

## 上游产出摘要（dependsSummary）
- 实现 reqboard_submit(kind=prototype) 登记编排与豁免留痕
- 把原型骨架迁入 brainstorming 并幂等落盘

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T10:54:22.289Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

这一步做完，「新规则不追溯砸老需求」有了机械证明：老需求的旧数据一个字节没被改写，历史需求一律标豁免，而新规则只对新需求生效。

### 完成项

- 加性零迁移有机械证明：旧分片三键仍为未采集、全量读取不写盘（mtime 逐份不变）、无新增迁移脚本
- 追溯缺节读出未采集且不判损坏；未知键忽略；形状真坏才报错
- 历史豁免实测：命中 UI 且缺节的存量一律标历史豁免且判健康；对照组推后生效日立刻点名
- 四个新门对存量为空产物的一律放行（对照组填非空立刻给三种拒绝码）
- 全量读取 368 份追溯文件零异常
- 文件名冲突按最小破坏处置：保留另一需求既有的 7 条断言，只追加不覆盖
- 28 例 + 相邻 46 例全绿、typecheck 0；两条反证真跑出红

### 改动文件

- `tests/compat-regression.test.ts`

### 下一步

t23 端到端证据引用本卡的零迁移证明；归档时把两处口径边界（份数口径、归档判据）一并写进合并去向文档。

---
