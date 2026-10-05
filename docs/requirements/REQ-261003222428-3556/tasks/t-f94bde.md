# t-f94bde 死代码清偿（删四文件三测试）·测试

> 需求：REQ-261003222428-3556 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

## 在做什么
死代码清偿（删四文件三测试）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-03T16:10:31.214Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

测试段完成：删除后全量与基线逐文件一致、零新增失败；死代码清偿判据全部成立

### 完成项

- 全量 pnpm test：98 failed / 3494 passed——与 22:0x 基线失败清单逐文件 diff 完全一致（diff exit 0），本卡零新增失败
- 附带观察：23:57 他窗的 +1（card-types）已自愈转绿——其 StageKind 扩段已收稳
- npx tsc --noEmit：删除后归属错误 = 0（四符号引用零命中）
- 删除量：3 源文件 + 3 专属测试（StartSubtaskChain/background-runner/batch-scheduler 及其单测），checkpoint-manager 按约保留

### 改动文件

- `docs/requirements/REQ-261003222428-3556/tasks/t-f94bde.md`

### 下一步

t4 父卡收尾；随后 t3/t5/t6/t7（四卡独立）

---
