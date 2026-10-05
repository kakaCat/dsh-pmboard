# 评审报告（REQ-261004110201-f253）

> 复核通道：每张任务卡走存量卡五段状态机，各段汇报逐条核对设计；本报告是需求级总核。

## 结论

**通过**。四功能点全部落地且判据可复跑；「未配置即现状」由集中等价面守住；
两处偏离均已声明；协议零必填键、存储版本未动、无回填。

## 八卡核对

| 卡 | 交付 | 判据 | 状态 |
|---|---|---|---|
| t1 定契约 | 路由校验/两级命中纯函数 + 三个配置 accessor + 协议三个可选键 | stage-model-routing 契约段 12 条 | ✅ |
| t2 路由注入 | 生成器注入 provider/model；ExecuteTask 取路由（需求难度参与） | 生成器段 6 条（含逐字节不变） | ✅ |
| t3 产出数写入 | closeExecutions 收 outputCount → 落 outputCount/zeroOutput | stage-telemetry 写入段 6 条 | ✅ |
| t4 遥测读模型 | stageTelemetryOf 派生聚合 + status 回执 + schema 先声明 | stage-telemetry 读取段 4 条 | ✅ |
| t5 零产出告警 | streak/去重纯函数 + 真实路径留痕（不阻断） | zero-output-alert 5 条 | ✅ |
| t6 优先级 + WIP | scanAndResume 排序 + 在制判据 + wip_limit 回执 + 看板首键 | requirement-priority 6 条 | ✅ |
| t7 兼容与迁移 | 四条等价面集中 + 不回填边界 | config-defaults-parity 7 条 | ✅ |
| t8 收口 | 全量回归 + 说明书/契约页同步 + 知识层重生成 | pnpm test / kb:check | ✅ |

## 设计承诺逐条核验

| 承诺（design/architecture） | 实现 | 判据 |
|---|---|---|
| 路由两级命中；未配置不注入（脚本逐字节不变） | `resolveStageModel` + 生成器条件拼参 | stage-model-routing |
| 遥测按**子卡阶段**派生、不落第二个桶；无数据省略键 | `stageTelemetryOf` 纯投影 + QueryState 条件加键 | stage-telemetry |
| 零产出只告警不改模板、去重可推导、未知即断 | `shouldAlertZeroOutput` / `zeroOutputStreak` | zero-output-alert |
| 优先级降序 + 同值 createdAt 升序；在制 = 新鲜锁；上限 0 = 不限 | scanAndResume 排序与闸门 | requirement-priority |

## 偏离总账（两处，均已在卡面声明）

| 处 | 设计原文 | 实现 | 理由 |
|---|---|---|---|
| t6 | 看板列表「按 priority 降序、同值 createdAt 升序」 | priority 作**首键**，其后保留既有状态档位→更新时间 | 看板按状态分组是既有 UX，整体改成 createdAt 序会打乱分组；**调度侧严格按设计口径** |
| t6 | 排序/在制判定发生在摘要投影之后（设计未提摘要字段） | 摘要新增 `priority` 与 `advanceLockAt` 两个**有界标量** | 不进摘要就得回读整条需求；两者均已进 `SUMMARY_KEYS` 受出口形状检查 |

## 诚实声明

- harness 提示提到的 `agent-dh/scripts/wiki_probe.py` 在**本仓不存在**；以本仓知识层自检
  `pnpm run kb:check`（11 项，含生成物零漂移）替代，并在 t8 汇报中如实记录。
- 零产出计数口径：`parseSubtaskOutput` 会把 `summary` 兜底成一条 `completed`，
  故「只写结论」的段计数为 1 而非 0——与凭证明细同源，不另立算法（t3 汇报已记）。

## 边界核对

- 四条不做（模型自动优选 / 自动改模板 / 跨需求预算硬闸 / 回填历史遥测）逐条遵守：无一处越界实现。
- 未对计划外调用方做破坏性改动：三个协议键与三个配置项全部可选，旧调用方零改动。
