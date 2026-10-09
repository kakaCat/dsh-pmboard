# t-c0a71e Dive Service 外壳外移到适配层·测试

> 需求：REQ-261008020617-088f 层边界收口：15 处 application/ I/O 越界端口化 + 层门补豁免面

## 在做什么
Dive Service 外壳外移到适配层·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-07T18:51:43.924Z，窗口 session-914181c9-d280-4922-adc7-36cf2083f4ea）

测试段完成：全量 15 失败全在台账内，层门 application 用例转绿（整文件仅剩边界外那条）。

### 完成项

- 测试段验收：pnpm test → 608 文件 / 7176 用例，9 文件 15 用例失败、7134 通过（较上一卡读数 21 降 6）
- 层门关键读数：tests/layer-boundary.test.ts 9 用例仅 1 条失败 —— application/ 越界用例已转绿，剩下的正是边界外的 tools/http 那条（与需求锚点『failed 2 → 1』一致）
- 失败集合全部落在守恒台账内（doc-sync / e2e-triad-gate / interruption / message-hygiene / size-budget / t7-legacy / template-address / triad），无一条与本次改动相关
- 别窗口在途工具的三条失败（task-amend / readme-tool-face / typecheck）本轮已消失（他们收工了）
- npx tsc --noEmit → 0 错

### 改动文件

- `src/adapters/ReqboardDiveManager.ts`

### 下一步

父卡 t-d18c15 收尾；随后接手 t8（层门豁免面）

---
