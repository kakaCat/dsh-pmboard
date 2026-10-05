# t-ef6fe1 看板扫描不再拿全部项目的清单用同一个目录去扫·研发

> 需求：REQ-261001203710-0fbf 计划落库未按需求工作区校正根：queue.json 与任务卡被写进另一个工作区

## 在做什么
看板扫描不再拿全部项目的清单用同一个目录去扫·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-01T13:41:13.726Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

看板扫描不再翻别人家的档案。这一步做完，什么变了——以前扫本项目时会顺手拿本项目的目录去「解读」别项目的需求记录，于是**别的项目里恰好有个同名目录，就会把它的文件登记成本项目需求的产物**（这条我用旧实现复现出来了）；现在不属于本项目的记录被直接跳过并计数回报，同名目录再巧也不会被认错。

### 完成项

- src/adapters/ArtifactSync.ts：syncAllReqArtifacts 不再「取全部 id 用同一个 cwd 扫」；改为 partitionByProject 逐记录按 projectRootOf 解析——本项目按本根扫、未归属按 cwd 扫（单独成桶）、**别的项目跳过并计数**；返回体由裸 number 扩为 { scanned, skipped } 并新增 SyncAllArtifactsResult 类型
- 新增可注入接缝 ArtifactSyncSeams.makeDocs（默认构造真实 FileDocRepository）：测试注入「计数版」仓储即可直接断言「另一个项目零访问」，不必靠状态间接推断
- realpath 归一位于适配器层（本层允许碰 node:）：partitionByProject 传 realpathSync，避免 macOS 上 /var 与 /private/var 被误判成两个项目
- 唯一调用点 src/http/routers/stages.ts **无需改动**：它只 `await ... .catch(()=>{})`、丢弃返回值，返回体扩字段不影响它（类型检查已确认 stages.ts 零错误）；按「不加功能、不扩范围」未顺手让它消费 skipped
- 判别力自证（关键）：把实现临时退回旧行为后重跑，用例**先炸在污染断言**上——「B 的产物被 A 的目录污染了：expected [ {stage:'brainstorming',…} ] to deeply equal []」，即旧实现确实拿 A 的根把 A 下同名目录登记成了 B 的产物。这一步也暴露并修正了我测试自身的一个弱点（原先失败的只是 skipped 计数，真正杀伤性的断言没被触发，已把它提到最前）
- 自测：npx vitest run tests/project-scope.test.ts → 16 passed（含零访问/跳过计数/污染判别/正向对照）；npx tsc --noEmit → 191 条 ≤ 基线 192，改动三个文件零错误（期间修掉自己测试替身漏实现 DocRepository.resolve 的 2 条新错误）

### 改动文件

- `src/adapters/ArtifactSync.ts`
- `tests/project-scope.test.ts`

---
