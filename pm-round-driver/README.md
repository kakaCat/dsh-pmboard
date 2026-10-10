> ## ⚠️ 已退役（2026-10-10 用户裁定：以 goal 为基础重写驱动）
>
> 继任者：**`goal/pm-goal-round-driver`**（以 goal 为核心的决策树 + 投递提示词 + 停手/投递纪律）。
> 本包**保留**（既有测试与看板路径仍在用），新驱动接线并验收通过后再删除。
> 迁移进度见 `goal/pm-goal-round-driver/README.md`。

# pm-round-driver

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

回合驱动（dive 劈两半的驱动面）：驱动循环与回合状态推进。

## 允许依赖（分层 `L2`）

pm-common · pm-core

## 边界

依赖 pm-common · pm-core。

## 测试

```bash
npx vitest run pm-round-driver/tests
```
