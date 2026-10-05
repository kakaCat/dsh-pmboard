# t-cbaf3a 定契约：失败分类器 + 三个判定纯函数 + 类型扩展·测试

> 需求：REQ-261004065652-5c1c Dive 死循环根治：投影同源 + 失败熔断 + 中断即闭锁

## 在做什么
定契约：失败分类器 + 三个判定纯函数 + 类型扩展·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-03T23:10:40.390Z，窗口 session-2680cf17-b887-4352-bfdd-65ca72b53558）

t1 测试段完工：9 个测试文件 200 条用例全绿，类型闸门 144 与基线持平，层边界失败均为既有违规。

### 完成项

- 新用例：4 个文件 48 条全绿（upstream-failure 16 / human-gate 14 / chain-budget 10 / provider-latch 8）
- 相关回归：另 5 个文件全绿（domain-summary 14、dive-round-state 18、dive-rearm 24、dive-manager-alignment 13、store-contract 83）
- 合计命令与结果：npx vitest run <9 文件> → Test Files 9 passed / Tests 200 passed（1.15s）
- 类型闸门：npx tsc --noEmit | grep -c 'error TS' → 144（与开工基线持平，改动文件零错误）
- 层边界：tests/layer-boundary.test.ts 3 处失败均为既有违规（点名 http/routers 与 application/gate 等，非本卡文件）
- 反向演练留到后续卡：投影刷新（t2）、熔断阈值（t3）各有专门的反向演练用例
- 证据可复跑：命令与输出摘要将随 t9 汇总进 evidence/regression.md

### 下一步

父卡 t-58c271 汇总收尾后进入 t2（投影读己所写）

---
## 汇报 2（2026-10-03T23:11:30.122Z，窗口 session-2680cf17-b887-4352-bfdd-65ca72b53558）

补全量回归证据：失败数 47/97 与基线逐项持平（新增失败 0），通过数 +48 恰为本次新增用例。

### 完成项

- 全量回归（补测卡文要求的 pnpm test 口径）：npx vitest run → 47 failed files / 97 failed / 3571 passed / 20 skipped（354 文件 / 3688 用例，41.7s）
- 与开工基线逐项对比：失败文件 47→47、失败用例 97→97（新增失败 = 0）；通过文件 300→304、通过用例 3523→3571（+48 = 本卡新增用例）
- 结论：本卡只增绿不增红；4 个新测试文件全部被全量跑收集到

### 下一步

父卡汇总收尾 → t2 投影读己所写

---
