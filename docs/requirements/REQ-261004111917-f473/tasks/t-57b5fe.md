# t-57b5fe 兼容口径回归 + 工具 schema 文案·测试

> 需求：REQ-261004111917-f473 修复看板/需求详情深链 404：/dashboard#pmboard 已失效，补兼容路由 + 前端定位

## 在做什么
兼容口径回归 + 工具 schema 文案·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-04T03:55:22.473Z，窗口 session-168fa441-ba3a-45f8-9240-cfa416e2a4ec）

测试段结论：本卡没让任何既有用例变红（全量失败数 97 与上一卡收尾时完全相同，通过数 +8 = 新增用例），描述文案与产出值的契约都被用例钉住。

### 完成项

- 全量 pnpm test（t4 改动后）：47 failed 文件 / 97 failed 用例 / 3742 passed / 3859 总
- 基线对照：t3 收尾时同一命令为 47 files / 97 failed / 3734 passed / 3851 总 → 失败数完全不变（97），通过数 +8 正是本卡新增用例
- npx tsc --noEmit：144 条 error TS，与 t3 收尾时一致；本卡文件零 error
- 本卡用例：tests/tool-schema-board-link.test.ts 8/8 全绿（含复核补强的 type 断言）
- 反向演练 2 组（改完即撤、文件 sha256 逐字节还原）：改 QueryState 路径 → 1 红；回退 StatusTool 描述文案 → 2 红
- 存量为红（非本卡）：apply-wiring 工具名清单 18 vs 23 等 97 条，改动前后一致

### 改动文件

- `tests/tool-schema-board-link.test.ts`
- `src/tools/StatusTool/StatusTool.ts`
- `src/tools/CaptureTool/CaptureTool.ts`
- `src/tools/CreateTool/CreateTool.ts`

### 下一步

父卡收尾；dist 重建含新文案与 E2E-1 真机点击由 t5 验收。

---
