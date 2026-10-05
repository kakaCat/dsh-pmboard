# t-ea0f5b 零变更核验 + 全量回归 + 回滚路径演练（兼容卡）·测试

> 需求：REQ-261002115204-ba52 长文本工具参数写法约定：防整轮失败的入参约束

## 在做什么
零变更核验 + 全量回归 + 回滚路径演练（兼容卡）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T03:59:30.860Z，窗口 session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5）

测试段结论：终态验收命令全部跑过并留档——用例 10 passed、全量失败集合与开工基线一致（49 文件 / 98 用例）、改动文件零新增类型错误、产物一致性 exit 0、构建 exit 0 且产物命中新文本；回滚演练可复现。数字口径 3 处偏差已按实测写进证据文件。

### 完成项

- 命令 1：npx vitest run tests/arg-guidance.test.ts → 10 passed，退出码 0
- 命令 2：npx vitest run --reporter=dot → 49 failed / 251 passed（303 文件）；98 failed / 3001 passed（3119 用例）；失败集合与开工基线逐一对齐，通过数 2991 → 3001
- 命令 3：npx tsc --noEmit → 报错 194 行（基线 197）；用本次改动清单过滤输出 → 0 命中（改动文件零新增）；另如实记录 src/tools 下 2 条存量错误不在改动清单内
- 命令 4：node scripts/check-prompt-fragments.mjs → exit 0（片段与产物一致、heavy ↔ vendor 逐字节一致）
- 命令 5：pnpm build → exit 0（[verify-client] OK, bundle 335555 bytes）；dist/index.mjs 命中「拆成多次调用」×2、「汇报自检」×2
- 回滚演练：常量还原为旧形态 → 6 failed / 4 passed；还原 → 10 passed
- 证据文件已按实测口径静默修正 tsc 范围的表述（改动清单过滤 → 0 命中），避免「src/tools/** 零新增」这种过宽说法

### 改动文件

- `docs/requirements/REQ-261002115204-ba52/notes/t5-verification-evidence.md`

### 下一步

父卡 t5 收尾；随后提交验收材料（kind=verification）。

---
