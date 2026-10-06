# 逆验证留档（REQ-261005122915-9f90 t7）

> 由 `node --import tsx/esm scripts/rework-inverse-verification.mts` 生成。
> 约定：**注入旧实现必须变红，还原后必须变绿**——两次都留档。

| # | 注入的旧实现 | 用例文件 | 注入后 | 还原后 | 判定 |
|---|---|---|---|---|---|
| A · FR-1 判据回退 | 把落库幂等判据换回「未取消即真卡」——占位重做卡于是重新冒充已落库（现场缺陷本体） | `tests/approved-plan-landing-rework.test.ts` | 红（✅ 如期） | 绿（✅ 如期） | ✅ 通过 |
| B · FR-2 收敛缺席 | 去掉批准路径的回退态收敛调用——回到「只有手动拆分路径收敛」的三处漂移形态 | `tests/approved-plan-landing-rework.test.ts` | 红（✅ 如期） | 绿（✅ 如期） | ✅ 通过 |
| C · FR-4 占位卡复位 | 让占位重做卡重新落进「子卡复位」分支（改回 todo）——第二轮回退也清不掉 | `tests/rollback-tasks.test.ts` | 红（✅ 如期） | 绿（✅ 如期） | ✅ 通过 |
| D · FR-3 无条件推进 | 看板批准路径回到「无论落没落库都推进到实施」 | `tests/reqboard/board-plan-approve.test.ts` | 红（✅ 如期） | 绿（✅ 如期） | ✅ 通过 |

**结论**：四处注入全部如期变红、还原后全部变绿 —— 用例确实钉在修复上（不是测空气）。
