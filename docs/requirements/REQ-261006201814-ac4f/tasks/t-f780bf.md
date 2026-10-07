# t-f780bf 堵掉四处仍在写真实工作树的测试点位·研发

> 需求：REQ-261006201814-ac4f 测试反向与异常覆盖补强（错误码矩阵 / 红基线分诊 / hermetic 夹具）

## 在做什么
堵掉四处仍在写真实工作树的测试点位·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T04:51:27.329Z，窗口 session-ec318e7e-5a51-4037-96c2-d70aced8a3ff）

研发完成：四处泄漏点位全部改走临时根，沙箱引入的 7 条红清零，四个文件在沙箱开启下 53 用例全绿、零残留。

### 完成项

- rtm-health：测试根由 process.cwd() 改为 testWorkspaceRoot()，不再写真实工作树
- capture-hook：队列根由 process.cwd() 改为 testWorkspaceRoot()
- plan-footprint-propagation 与 tool-schema：rmSync 由仓库路径改为临时根（与 stubDocFile 落点一致）
- 验收一：四个文件 53 用例全绿（沙箱开启状态下）
- 验收二：git status 中 .test-rtm-health 前缀命中数为 0
- 副作用归零：u1 沙箱引入的 7 条红已全部消除

### 改动文件

- `tests/unit/rtm-health.test.ts`
- `tests/capture-hook.test.ts`
- `tests/plan-footprint-propagation.test.ts`
- `tests/plan-footprint-tool-schema.test.ts`

### 下一步

交复核；随后按批次继续 u4（触发矩阵）等卡。

---
