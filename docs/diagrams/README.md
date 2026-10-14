# 图表（drawskills · drawio 引擎）

| 文件 | 内容 |
|---|---|
| `pm-goal-round-driver-loop.drawio` / `.svg` / `.png` | **驱动拍主循环**：5 路触发 → 事件入口 → factsOf → `decideGoalRound`（八步闸，纯函数）→ 不变量 → `actOnDecision` 六态 → 投递纪律 / 准入 / 停手纪律 |
| `pm-requirement-lifecycle.drawio` / `.svg` / `.png` | **需求全生命周期 × goal 轮驱动**：七阶段每段一个 goal 周期（create-goal → drive → admit → ask-stage-done → 人落章 → 推进），三道人门由驱动发起，旁路与停手纪律 |
| `pm-tool-face-vs-goal.drawio` / `.svg` / `.png` | **工具面 × goal 口径**：goal 面 6 件（驱动判据唯一来源）vs 台账面 19 件（驱动零 I/O 不碰）+ T1 缺口 / T2 收敛 / D3 待定夺 |
| `pm-tool-merge-before-after.drawio` / `.svg` / `.png` | **工具面合并对比**：25 → 21（goal 面去重 4 处；台账面 19 件不动的理由 + 落地顺序 + 成本） |
| `pm-tool-face-target.drawio` / `.svg` / `.png` | **按 dsh goal 形态收敛工具面**：25 → 8（宿主 3 件对照 + 7 条收编线 + 三处不能省 + 迁移三批 + 代价） |
| `goal-plugin-flow.drawio` / `.svg` / `.png` | **goal 独立插件运行回路（改造后）**：立项 seed → 驱动决策 → create-goal / drive → 回合工具（`goal_*` + `reqboard_*`）→ 人落章 `stage_goal_done` → 推进 → 终态；左侧插件边界（6 件工具 / 自有阶段定义 / 自有 store 端口），右侧人门与授权 |
| `pm-architecture.drawio` / `.svg` / `.png` | 系统分层架构与调用链：触发层 → L2 入口（`pm/` 主体包 + 适配包 + 3 资产包）→ L1 领域 → L0.5 类别 → L0 底座 + 落盘；`pm-goal-round-driver` 标为唯一驱动点 |

- 源文件是 `.drawio`（draw.io 桌面版可直接编辑）；`.svg` / `.png` 是同一次几何的导出物。
- 绘图规则来自 [drawskills](https://github.com/haowu77/drawskills) 的 `prompts/drawio/_base.md` +
  `flowchart.md` / `architecture.md`，配色用 `palettes/colors.md`（驱动循环用 Purple Dream，其余用 Material Blue）。
- 包数口径：架构图按**实际工作区**列出 21 个 `package.json`（`pnpm-workspace.yaml` 的 glob 实扫）；
  `docs/architecture/workspace-packages.md` 标题写「16 个 workspace 包」——差 4 个 = 3 个资产包 + `pm/` 主体包，引用时注意口径。
  （2026-10-11 退役 `pm-workflow`：工作区总数 21 → **20**。）

## 驱动口径（事实来源）

| 图上元素 | 代码锚点 |
|---|---|
| 5 路触发源 | `pm/src/index.ts:325-334`（存储订阅桥发 `reqboard/requirement-moved`）· `pm/src/adapters/goal-round-lifecycle.ts:142-146`（`requestDrive`）· `goal/pm-goal-round-driver/src/subscriptions.ts:29-41` |
| 八步闸 + 相位分支 + 六态 | `goal/pm-goal-round-driver/src/decide.ts`（判定顺序即纪律）与 `src/types.ts`（`RoundDecision`） |
| 决策 → 动作 / 不变量 | `src/act.ts`（六态映射端口）· `src/invariant.ts`（INV-D1~D5） |
| 投递 / 准入 | `src/admission.ts`（queued → claimed → admitted；cancelled / stale 永不计数） |
| 阶段裁决弹框 | `src/stage-prompt.ts`（冷却 5min / 上限 2 次 / 指纹变了重计 / 永不抛） |
| 停手与心跳 | `src/hold.ts` · `src/heartbeat.ts`（`planWake` 五判据） |
| 七阶段状态机与三道人门 | `pm-core/src/domain/requirement/{RequirementStatus,RollbackSpec}.ts` |
| 子卡链模板 | `pm-core/src/domain/task/SubtaskTemplate.ts`（`SUBTASK_TEMPLATES`） |
| 各阶段交棒工具 | `pm-core/src/domain/prompt/chain.ts`（`STAGE_CHAIN`） |
| 收尾归工具面 | `goal/tool-pm-goal/src/wrapup.ts` · 驱动 `postRound` 端口（`src/driver.ts`） |

## 工具面口径（goal 面 vs 台账面）

- **goal 面**（`tool-pm-goal`，6 件，独立插件面 `name='goal'`）：`goal_get/create/update` + `stage_goal_get/create/done`（不带 `reqboard_` 前缀）
  —— 驱动的判据来源：`create-goal` 决策 → `ports.createGoal` → `pm-goal.createGoal`；
  `ask-stage-done` 的判据 = `readyToCloseOf()` = `goals.length > 0 && every done`（`goal/pm-goal/src/fold.ts:403`）。
- **台账面**（`tool-pm`，19 件）：产物 / 任务卡 / 人门 / 协作 / 知识层 —— 驱动是零 I/O 纯决策，这些不收进 goal 面。
- **缺口（2026-10-11 已修）**：立项时 `seedGoalStages()` 按 goal 插件自有的阶段定义
  （`goal/pm-goal/src/stages.ts`）一次写全七段——`pm-core` 的 `StageGoalSeed` 现在只是转发，不再各持一份模板。
  `stage_goal_create` 不传 `goals` 也按同一份定义建全表。⇒ 阶段表不再「没人登记」，驱动的 `ask-stage-done` 不再死锁。
  工具名同时去掉了 `reqboard_` 前缀（goal 面是独立插件面：`goal_get/create/update` + `stage_goal_get/create/done`）。

## 已知与图不符之处（画图时发现，未改代码）

1. `ask-close` 是 `RoundDecision` 的合法态（`types.ts`、`act.ts` 都处理），但 `src/decide.ts` **从不产生**它
   —— 收口弹框当前不可达，收口复用的是 `ask-stage-done` 通道。
2. `postRound`（H1 推进校验 / H2 压缩 / H3 注入 / H4 唤醒 / H5 审计）已收归驱动在回合收尾发一次调用
   （`src/driver.ts:312-316`），但 `node-settlement` 仍保留自己的隔离触发（README §迁移进度已注明属 H2 待收编）。

## 重新导出

```bash
cd docs/diagrams
D=/Applications/draw.io.app/Contents/MacOS/draw.io
for f in pm-goal-round-driver-loop pm-requirement-lifecycle pm-architecture; do
  "$D" --export --format svg --output $f.svg --no-sandbox $f.drawio
  "$D" --export --format png --scale 1.4 --output $f.png --no-sandbox $f.drawio
done
```

## 坑：edge 必须带 `mxGeometry`

每条连线单元都要有 `<mxGeometry relative="1" as="geometry" />` 子元素：

```xml
<mxCell id="e1" style="endArrow=classic;..." edge="1" source="a" target="b" parent="1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
```

缺了它，draw.io CLI 导出的 SVG/PNG **只渲染节点、连线全部丢失**（`<path>` 数量为 0），
容易误判成「draw.io 不支持导出连线」。

## 坑：长连线用显式 waypoint，别指望自动布线

跨区（左旁路区 ↔ 主链）的长连线交给 `orthogonalEdgeStyle` 自动布线时，会横穿中途的节点框。
用 `<Array as="points">` 显式给拐点，例如：

```xml
<mxGeometry relative="1" as="geometry">
  <Array as="points"><mxPoint x="462" y="300" /><mxPoint x="462" y="1240" /><mxPoint x="260" y="1240" /></Array>
</mxGeometry>
```
