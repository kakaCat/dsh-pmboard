# t-f7f36e 把数据放哪、长什么样定成纯函数：路径、摘要、日志行·测试

> 需求：REQ-261002161439-277d reqboard 数据层重构：台账分片 + 读放大治理 + 存储端口化（SQLite 就绪）

## 在做什么
把数据放哪、长什么样定成纯函数：路径、摘要、日志行·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T08:42:51.086Z，窗口 session-8c9338a3-fc36-4c3a-bda1-d73c7e78d783）

测试子卡：三份单测 71 用例全绿，typecheck 与改动前逐条一致，全量回归 97 failed 低于基线 106。

### 完成项

- npx vitest run tests/reqboard/domain-*.test.ts → 3 files / 71 passed
- 四条卡上判据各有独立用例：路径拼接 12、摘要键集 14、日志编解码与截断 45
- npx tsc --noEmit → 187，与改动前逐条一致（diff 空），我的文件零错误
- pnpm test → 97 failed / 3101 passed / 20 skipped，低于文档基线 106 failed
- 三模块零消费者，不可能影响其他用例
- 跨模块冒烟与真实台账回放各一次，退出码均为 0

### 改动文件

- `tests/reqboard/domain-paths.test.ts`
- `tests/reqboard/domain-summary.test.ts`
- `tests/reqboard/domain-journal.test.ts`

### 下一步

本卡收尾后开 t2（端口定义与数据契约）：在 ports.ts 新增 RequirementStore 与错误码，与旧端口并存，用内存替身先跑通契约测试。

---
