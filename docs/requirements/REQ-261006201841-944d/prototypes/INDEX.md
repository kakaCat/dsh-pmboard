# 原型清单（REQ-261006201841-944d）· 2026-10-06

> 权威版本**恰好一条**（0 条 / 多条 = `prototype_version_conflict`）；作废版本标 `superseded`，
> 并在「被取代于」列写权威版本的路径。维护纪律：本表由 agent 手写，登记侧只校验不改写。

| 路径 | 状态 | 服务条款 | 被取代于 |
|---|---|---|---|
| prototypes/archive-source-label.html | authoritative | FR-7 | |
| prototypes/detail.html | superseded | FR-1 | prototypes/archive-source-label.html |

## 权威版本说明

`prototypes/archive-source-label.html` 是本需求**唯一** authoritative 原型，覆盖 FR-7
（看板归档条按项目身份标注来源：本仓 / 在别处 / 归属未知三态 + 点开提示块 + 归档材料人读面小样）。

`prototypes/detail.html` 是 v0.1 骨架（占位内容，未承载实际 FR 结构），已标 `superseded`，
文件保留不删（纪律：换正式稿时旧稿标 superseded、不删文件）。

## 页面内容索引

| 页内区块 | 内容 |
|---|---|
| §1 三态并排对照 | A 本仓 / B 在别处（`dsh-notice-webhook`、`quantsys-v2`）/ C 归属未知，各 3 条 chip |
| §2 紧凑态与 hover 态 | 默认紧凑态、hover 态、来源标注不位移 |
| §3 点开后的提示块 | B 态「在别处」提示（来源项目 / 需求根 / 下一步）；C 态「归属未知」提示；A 态对照 |
| §4 归档材料小样 | FR-5 人读三件套（结论 / 合并去向 / 文档清单）+ FR-6 机器产物折叠（一行一类 + 数量 + 体积 + `queue.json` 摘要） |
| §5 改动面 | DOM / CSS 新增选择器 / 判据单一来源 / 可访问性（供实现对齐） |

## 约束遵守

- 只在内联 `<style>` 里**逐字复制** `src/client/styles/base.ts` 与 `src/client/styles/board.ts` 的既有分片，
  未新增视觉体系、未换字体族、未发明主色；新增选择器仅用既有令牌。
- 单文件自包含、无构建、无外部请求，可直接用浏览器打开。
- 未修改任何源码 / 配置 / 其他目录。
