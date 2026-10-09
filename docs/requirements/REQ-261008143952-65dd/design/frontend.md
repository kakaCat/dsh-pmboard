---
serves: FR-1, FR-3
---

# 前端设计 — 更新 vendor superpowers 分片到本地最新版 `serves: FR-1`

> **本需求不产生任何 UI 界面**：改动全部落在提示词文本资产（`.md`）与其构建期产物。
> 需求 front-matter 已声明 `prototype_exempt`（D-4 裁定）。本文档存在的意义是说明
> **"前端端侧"在本需求里的真实所指**（前端提示词纪律的注入面），并如实声明各节不适用。

## 原型页面 `serves: FR-1`

### 结论：本需求无原型、无界面 `serves: FR-1`

| 项 | 事实 |
|----|------|
| 需求声明 | `prototype_exempt: 本需求为提示词分片更新，无界面改动…`（D-4 已落账） |
| 目录现状 | `docs/requirements/REQ-261008143952-65dd/prototypes/` 下有系统在**进入需求阶段时自动落盘的骨架**（`detail.html` = `templates/brainstorming/prototype.html` 的模板副本，`INDEX.md` 声明其 authoritative / 服务 FR-1） |
| 该骨架的性质 | **模板占位，不是设计产物**：HTML 内文仍是「（界面草图区）/（功能点名）」等填写提示，没有任何真实界面内容 |
| 为何仍声明 frontend | vendor 原文含**前端提示词纪律**（原型工作原则、组件树、视觉验证），更新它会改变前端任务的注入文本——"前端端侧"指的是**这个注入面**，不是要做界面 |
| 原型对照 | **不适用**：豁免生效，验收不要求「与原型对照截图」项（`prototype_exempt` 已生效） |

**给实施者的纪律**：不要为了让这个骨架"看起来像原型"而补内容——本需求没有界面要画。原型目录保持系统落盘的骨架即可，不做 `reqboard_submit(kind=prototype)` 登记。

## 组件树 `serves: FR-1`

**不适用**：本需求不新增、不修改、不删除任何 UI 组件。

理由：本需求的改动集是 8 处**文本与测试文件**（14 份 vendor 原文、1 份 heavy 镜像、1 份生成产物、1 份档案、1 份 overrides、3 处测试/基线），没有 `.tsx` / `.ts` 组件文件、没有页面、没有叶子组件。组件树的"叶子 = 拆卡粒度单位"这一用途在本需求没有承载对象，故保留本节并显式声明不适用（不删节——保留节能被机械判定）。

> 若将来出现"改前端提示词的呈现方式"（如把注入文本渲染到看板某处）的需求，组件树应在那次需求里给出。

## 目录与包结构 `serves: FR-3`

本需求触及的目录（沿用现状，**不新增目录、不新增文件**）：

```text
src/domain/prompt/
├── vendor/superpowers/
│   ├── ATTRIBUTION.md                    ← 改（来源表 + 14 行字节/行数）
│   └── <14 skill>/SKILL.md               ← 改（8 份内容变）
├── fragments/
│   └── implementing/
│       ├── heavy.md                      ← 改（镜像 = 新 executing-plans）
│       └── heavy/overrides.md            ← 改（新增 1 条覆盖）
└── generated/fragments.ts                ← 改（重跑生成器产出）

tests/
├── prompt-tiers.test.ts                  ← 改（关键词 + ATTRIBUTION 断言）
├── stage-prompts.test.ts                 ← 改（关键词）
└── fixtures/stage-prompts-baseline-p1.json ← 改（重跑 dump 脚本）
```

**前端相关目录（`src/client/`、`lib/client.js`）零改动**：本需求不碰看板 UI、不碰客户端产物。

## 组件结构 `serves: FR-1`

**不适用**：无组件改动。本需求的前端影响是**注入文本层面**的——`implementing` 阶段发给前端任务执行者的提示词会包含新版 `executing-plans` 的 inline 执行纪律（`The Task Loop`、完成契约、Rulings not stalls），以及本仓 overrides 对三处不可执行项的收口。

## 页面与组件（编号表） `serves: FR-1`

**不适用**：无新增/修改页面与组件。本需求不产生可编号的前端单元。

## 状态管理 `serves: FR-3`

**不适用**：无前端状态改动。注入文本是**服务端/宿主侧**的构建期常量（`FRAGMENT_LIBRARY`），不进入前端状态层；看板不渲染这些文本（`resolveStagePrompt` 供 agent 注入，不是 UI 数据源）。

## 路由与导航 `serves: FR-1`

**不适用**：无路由改动。

## 样式与主题 `serves: FR-1`

**不适用**：无样式改动。设计令牌（`src/client/styles/`）与主题变量均不动。

## 依赖与第三方库 `serves: FR-1`

**不适用（无新增依赖）**。但需说明一处**非 npm 的"上游依赖"**：

| 依赖 | 类型 | 本次变化 |
|------|------|---------|
| `obra/superpowers` | 上游文本源（非 npm 包，vendored） | v6.3.0 → v6.4.2（commit `b36e0829…` → `8ca22dba…`） |
| 许可 | MIT（Copyright (c) 2025 Jesse Vincent） | 不变 |

该依赖**不进 `package.json`**：上游文本在构建期内联进 `generated/fragments.ts` 后随包发布，运行时不读盘、不联网。这是本仓既有取舍（避免"运行时读盘失败静默降级"的事故类型）。

## 关键决策与取舍 `serves: FR-1`

| 决策 | 选择 | 取舍 |
|------|------|------|
| 是否交原型 | 豁免（`prototype_exempt` + D-4 落账） | 换取"不为无界面需求画原型"；代价是需在本文档说明豁免理由与骨架性质 |
| 是否清理原型骨架 | **不清理**，保持系统落盘状态 | 骨架由系统幂等落盘（"已存在就不覆盖"），删除会被再次落盘；且它不是产物，留着无害 |
| 是否声明 frontend 端侧 | 声明（已在需求阶段定下） | 换取 design 阶段产出本文档（说明前端提示词纪律的影响面）；代价是文档要如实写清"无界面" |
| 客户端产物是否重建 | 不重建 | 本需求不改 `src/client/`，无构建新鲜度问题 |

## 技术方案与亮点 `serves: FR-1, FR-3`

1. **如实声明而非省略**：「组件树」「状态管理」等节保留并写「不适用：<理由>」，符合本仓「保留节能被机械判定，删节不能」的纪律——同时不让读者以为漏写。
2. **点明"前端端侧"的真实所指**：本需求标 frontend 是因为 vendor 原文含前端提示词纪律，而不是要做界面；这一句消除了实施者对范围的误判（避免去补原型骨架）。
3. **上游依赖单列**：把非 npm 的 vendored 依赖显式写进依赖节（含 commit 与许可），让"文本供应链"在依赖视角下也可见。
4. **客户端零改动显式化**：`src/client/` 与 `lib/client.js` 零改动写清，避免实施者顺手重建客户端产物（无谓构建）。
