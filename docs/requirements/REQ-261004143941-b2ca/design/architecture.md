---
serves: FR-1, FR-2, FR-3
---

# REQ-261004143941-b2ca 设计 · 架构（会话头部流程图 token 常显）

## 目标与不变量（serves: FR-2, FR-3）

**目标（可证伪）**：会话头部流程图的 token 统计在**任意容器宽度**下至少可见一处；窄档改显「需求累计 Token 总数」，宽档保持既有「每节点 token」。

**必须同时成立的不变量（一条都不许破）**：
1. 标题行不被撑破：探针 6 档 `rowRightOverflow ≤ 0` 且 `docOverflow = 0`；
2. 芯片内部零滚动：`chartScrollX = 0`；
3. 当前节点与计数（`done/total`）恒在（既有 REQ-260930230225-71be 不变量）；
4. `FLOW_TIERS` 数值与每节点 token 的显隐规则**本次不动**。

## 现状链路与改动点（serves: FR-1, FR-2）

```
handleSessionProgress (src/http/routers/stages.ts)
      │  target = 该会话锚定的需求；tasks = 该需求任务
      ├─ nodeTokensOf(target, tasks) ──▶ nodes[].tokens.total（已有，本次不动）
      └─ 【新增】tokenTotal = totalTokens(assembleRequirementToken(target,{tasks}).totals)
                    │  仅 > 0 才写入响应（缺失即不发该键）
                    ▼
客户端 RequirementProgressAction (src/client/conversation-progress.ts)
      │  data.requirement.tokenTotal
      ▼
buildFlowChartModel (src/client/flow-chart-model.ts) ──▶ model.tokenTotal?
      ▼
渲染：.dsh-pm-cprog-inline 内、计数旁新增 .dsh-pm-cprog-token-total（不受 @container 档位影响）
```

**改动点清单（4 处源码 + 3 处回归）**：

| # | 文件 | 改什么 |
|---|---|---|
| 1 | `src/http/routers/stages.ts` | `handleSessionProgress` 复用同一份 token 视图，补 `requirement.tokenTotal` |
| 2 | `src/client/flow-chart-model.ts` | `FlowChartInput`/`FlowChartModel` 增可选 `tokenTotal`（有限且 > 0 才落模型） |
| 3 | `src/client/conversation-progress.ts` | `ProgressPayload.requirement.tokenTotal?`；计数旁渲染徽章 |
| 4 | `src/client/styles/token.ts` + `styles/board.ts` | 徽章样式（复用 `.dsh-pm-token-badge` 语言）+ 档位 D 的最小化变体 |
| 5 | `scripts/header-progress-probe.mts` | 标本带 `tokenTotal`；断言各档可见 token 元素 ≥ 1 |
| 6 | `tests/header-progress-responsive.test.ts`、`tests/session-progress.test.ts` | 模型/渲染与接口断言（见 test-cases.md） |

## 为什么新增「常显总数」而不是调档位阈值（serves: FR-2, FR-3）

- 调低 `FLOW_TIERS.token`（如降到 780）只能把「消失点」左移：容器 <780px 时 token 照样全没，是**症状位移**不是修复。
- 直接取消档位 B 的隐藏：7 个节点的 token 合计约 790px，窄窗口必然撑破标题行（违反不变量 1）或触发芯片内部滚动（违反不变量 2）。
- 新增一个**不参与降级**的单一数字（约 30–50px），既保住「窄档也有数」，又不与既有档位体系打架——档位只决定「节点级明细的密度」，总数是**结论**，不该被密度策略裁掉。

## 回归锚点（serves: FR-4）

- **三层断言**：模型层单测（`tests/header-progress-responsive.test.ts` 的落模型规则）、渲染层探针（`scripts/header-progress-probe.mts` 各档可见 token 元素 ≥ 1 + 不变量不破）、接口层（`tests/session-progress.test.ts` 的 `tokenTotal === Σ nodes` 与「缺失即缺席」）——逐条用例与命令见 `design/test-cases.md`。
- **为什么探针是硬门**：本需求的原发病是 CSS `@container` 档位里的 `display:none`，模型层单测看不见「用户是否真的看得见」；只有真实容器查询能量到，故探针断言并入 `problems` 判定（非 NONE 即退出码 1）。
- **红绿自证**：改造前实测 B/C/D 三档可见 token = **0**，所以「各档 ≥ 1」在改造前**必红**——不是事后补的装饰断言（可证伪性就落在这里）。
- **RTM 口径提示**：`test-cases.md` 被 RTM 生成器按测试文档排除在 `fr_to_design` 之外（`vendor/reqboard/src/rtm/context.ts:151` 的 `TEST_DOC_NAMES` 过滤），故 FR-4 的覆盖锚点必须落在本节这类**设计正文文档**里——本节的 serves 就是它。

## 兼容与回滚（serves: FR-1, FR-2）

- **兼容**：新增字段为可选；老客户端忽略未知字段 → 行为与今天完全一致；老需求无快照 → 键缺席 → 不渲染徽章（不出现 `🪙 0`）。
- **无迁移**：不落台账、不改存储 schema、不写盘、不新增配置开关。
- **回滚**：删掉该响应字段与前端渲染块即回到现状，无数据残留、无版本兼容负担。
