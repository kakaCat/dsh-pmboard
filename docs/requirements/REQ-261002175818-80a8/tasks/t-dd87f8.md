# t-dd87f8 余量参考上屏：节点输入包与任务树，都标「非判据」·测试

> 需求：REQ-261002175818-80a8 拆分阶段预判单轮余量：卡片体量声明与超容量强制分批

## 在做什么
余量参考上屏：节点输入包与任务树，都标「非判据」·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-04T05:39:25.868Z，窗口 session-5c6b1a8b-3234-4f35-b28f-1f1a20834721）

测试这一关的数字：全量 **96 failed / 3889 passed**——失败数比开工时**还少 1**（其他窗口修掉一条），本卡新增 10 条用例全绿。也就是说这一步既没惊动既有行为，又把"余量读数真的会出现在人眼前"这件事固定下来了。

### 完成项

- 本卡用例：tests/capacity-reference.test.ts 13/13（既有 9 条 + T9a–T9d）；tests/session-probe-wiring.test.ts 6/6
- 全量回归：96 failed / 3889 passed / 20 skipped（4005）——**失败数比基线 97 少 1**（无新增，且其他窗口修掉了一条）
- npx tsc --noEmit：145 条，与基线持平；本卡触及文件 0 错
- 环境限制如实记录：tests/isolate-node-context.test.ts 在本机整份加载失败（缺 @deepseek-ai/dsh-session 包），非本卡引入，已从相关命令中排除

### 改动文件

- `tests/capacity-reference.test.ts`
- `tests/session-probe-wiring.test.ts`

### 下一步

父卡收尾：四张子卡均已 done，补父卡完工记录后推进 t-bdda9c 到 done。

---
