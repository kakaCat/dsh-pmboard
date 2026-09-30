# t-eecd25 确认老需求与看板路径不受影响，并写好回滚方式·测试

> 需求：REQ-260930193929-897b G2 完整性闸门未按需求级 workspaceRoot 二次校正：文件在盘上却报 requirement.md 不存在

## 在做什么
确认老需求与看板路径不受影响，并写好回滚方式·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

怎么验（可执行）：① `node_modules/.bin/vitest run tests/design-gate-workspace-root.test.ts` → 期望 `Tests 13 passed (13)`；② `node_modules/.bin/vitest run` → 期望 `Tests 103 failed`（与改动前基线持平、无新增）；③ `grep -c "applyRequirementWorkspaceRoot" src/application/internal/support.ts src/application/use-cases/AskConfirm.ts src/application/internal/confirm-settle.ts src/application/use-cases/ConfirmArtifact.ts src/http/routers/requirements.ts tests/design-gate-workspace-root.test.ts` → 期望 5 个源文件 + 1 个测试文件均有命中（与回滚清单逐条对应）。

## 汇报 1（2026-09-30T12:43:37.988Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

兼容与回滚验证通过：定向 13/13、全量失败数持平（103）、类型与基线逐条一致；回滚清单与代码里的实际落点逐条对得上，期望值来自实测基线。

### 完成项

- 定向命令与结果：node_modules/.bin/vitest run tests/design-gate-workspace-root.test.ts → Test Files 1 passed (1)；Tests 13 passed (13)（含 t4 新增 3 例：看板正向推进、看板反向仍拦、存量无 workspaceRoot 时 no-op 行为）
- 全量对比基线：node_modules/.bin/vitest run → Tests 103 failed | 2641 passed | 20 skipped (2764)。对比基线（103 failed | 2627 passed）：失败数持平、无新增失败；通过数 +14
- 类型检查：tsc --noEmit → 213 条，与改动前基线按错误文本（规范化行号）比对 md5 完全一致——零新增、零消失
- 回滚清单可执行性核对：grep 统计 applyRequirementWorkspaceRoot 的出现位置 = 5 个源文件 + 1 个测试文件，与 notes/rollback.md 的清单逐条一致，无遗漏文件
- 回滚后验证值核对：rollback.md 里写的期望值（tsc 213、vitest 103 failed / 2627 passed）取自本次实测基线，不是估计值

### 改动文件

- `tests/design-gate-workspace-root.test.ts`
- `docs/requirements/REQ-260930193929-897b/notes/rollback.md`

---
