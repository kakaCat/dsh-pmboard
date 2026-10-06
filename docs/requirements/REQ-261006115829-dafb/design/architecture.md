# 架构设计（REQ-261006115829-dafb）

> 本需求**不改运行时代码**，只改 `docs/**`——所以这里的「架构」指**文档拓扑与判据的落点**：
> 这条报错的判据放在哪、从哪进得来、与既有页面怎么分工。
> 每个二级章节都带 `serves: FR-x` 标注（缺标注 = 孤儿章节，拆分阶段会被门禁拦）。

## 目标与总体方案 `serves: FR-1, FR-2`

**问题**：桌面端控制台的两条红字——插件包 `…/plugins/??…&rev=…` 404、`…/plugins/events` net::ERR_FAILED——
看着像插件坏了；2026-10-06 用户就是这样报障的，实测是「重建 / 重启竞态」，但仓内没有任何文档记录这条判据。

**当前状况**：`docs/architecture/plugin-runtime-prerequisites.md` 记的是「插件**是否被加载**」（profile / patch /
构建产物三连事故），不覆盖「包**地址**为什么 404」「HMR 长连接为什么断」；`docs/guides/` 只有一条与详情页维护
相关的指南，与本主题无关。

**设计方案**：在 `docs/guides/` 新增一条**故障排查条目**（症状 → 判据 → 机制 → 处置），
并在两处入口（说明书 + 插件运行前提页）各加一条回链；机制结论只写一句在回链处，主体留在条目里。

**不这么做的后果**：同类报错第二次出现仍要重新推导（本次已发生一次）；误判成「插件坏了」会去改没坏的代码。

## 文档落点地图 `serves: FR-1, FR-2`

```
读者入口                                     落点                                          内容
docs/architecture/project-manual.md  ──链接──▶ docs/guides/plugin-reload-troubleshooting.md
        （说明书索引区一行）                        ├─ 症状：两条红字的原文形态与地址形态
docs/architecture/plugin-runtime-                 ├─ 判据：三条可跑命令 → 200 / 200 / 404
        prerequisites.md                         ├─ 机制：rev 从哪来、为何过期、谁重试
        （「构建产物 ≠ 已加载模块」节 ──回链──▶    ├─ 处置：刷新页面；仍红按取证步骤走
          带机制一句）                             └─ 非目标：不是包地址的 404 / 宿主不可达
```

## 改动清单（文件级） `serves: FR-1, FR-2`

| 文件 | 类型 | 改动内容 | 服务条款 |
|---|---|---|---|
| `docs/guides/plugin-reload-troubleshooting.md` | **新建** | 排查条目页（症状 / 判据 / 机制 / 处置 / 非目标），≤ 120 行 | FR-1、FR-3 |
| `docs/architecture/plugin-runtime-prerequisites.md` | 修改（追加一节末尾回链） | 一句机制：包地址带 `rev`，rev 过期即 404；链接到条目 | FR-2 |
| `docs/architecture/project-manual.md` | 修改（索引区加一行） | 现象 → 条目链接 | FR-2 |

**不动的文件**：`src/**`、`dist/**`、`lib/**`、`docs/knowledge/**`。
知识层不把 `docs/guides/` 当输入，预期零漂移；如实测有漂移，按 C-13 先跑 `pnpm kb:build` 再提交。

## 数据结构变更 `serves: FR-1`

无变更——本需求不写台账、不改表、不改 schema。判定依据与回滚见 `design/data-model.md`。

## 接口变更 `serves: FR-3`

无运行时接口变更：不新增 / 不改 host 路由、SSE 协议、工具签名、客户端代码。
本需求唯一的「接口」是**条目页的文档契约**（四段必须提供什么、判据命令的输入输出与分诊）——
见 `design/interfaces.md`。

## 与既有页面的分工 `serves: FR-2`

| 既有页面 | 它回答什么 | 本条目回答什么（刻意不重复） |
|---|---|---|
| `architecture/plugin-runtime-prerequisites.md` | 插件**是否被加载**（profile 列了没 / patch 可读没 / 构建产物新不新） | 插件**已加载**时页面为何还报错（手里的包地址 rev 过期） |
| `architecture/project-manual.md` | 全局索引与说明书 | 只加一行索引，不复制判据正文 |
| `guides/requirement-report-page.md` | 详情页「改哪一块动哪个文件」 | 与页面维护无关，互不引用 |

## 兼容与回滚 `serves: FR-1`

- **兼容**：纯新增文件 + 段落追加，不改既有结论、不改既有标题层级；既有阅读路径只增不改。
- **回滚**：`git revert` 本次提交即可（删条目文件 + 还原两处追加）；无数据迁移、无外部依赖、无运行时影响。
- **风险与对策**：

| 风险 | 触发形态 | 对策（写进条目的约束） |
|---|---|---|
| 判据里的一次性数值过期（端口、rev） | 换机器 / 换启动即失效 | 条目必须写明「逐次实测取值」，并给**取当前值**的命令（C-1） |
| 链接腐烂 | 条目被改名 / 删除 | 验收按 `grep` 断言入链 ≥ 2（`design/test-cases.md` TC-2） |
| 被误读成「所有 404 都是噪声」 | 把真缺陷也刷新掉 | 条目「非目标」段显式排除非包地址的 404、宿主不可达，并给真缺陷分支（UC-4） |
