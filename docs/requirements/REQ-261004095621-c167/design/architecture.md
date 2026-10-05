---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
sides: [frontend, doc]
---

# 架构设计（REQ-261004095621-c167） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

## 目标与总体方案 `serves: FR-1, FR-3`

**问题**：编辑器里的模型选择器点开即消失——要判清归属（FR-1）并给出修复或上报（FR-3）。

**已查清（2026-10-04，证据见 `evidence/dsh-model-seat-crash.md`）**：**不是本仓缺陷**。
已安装的 DSH 客户端包内部不一致：`ui-model-selection`（rc.2）在菜单渲染路径要用
`primitives.MenuGroup` / `observeStickyMenuGroups`，而同一个 `app.asar` 里的 `ui-primitives`
是**旧构建**（两个导出都不存在）→ 运行时 `undefined` → React `#130` → 席位退役 → 控件空白消失。

**设计方案（本期交付）**：

1. **缺陷报告**（FR-3 交付物，已落盘）：现象/复现/运行时证据/静态证据/可复核命令/修复指引。
2. **知识沉淀**：知识层新增 1 条 `pitfall` 条目——"DSH 席位静默退役 = 渲染崩溃"的判别法与取证法，
   让下次任何"控件静默消失"先按此法三步判（inspect 看 `active` → 控制台取原文 → `npm pack` 对标安装一致性）。
3. **防呆断言**（FR-4）：保留既有的"组件必须是合法 React 元素（`$$typeof`）"断言；
   已修的同款缺陷（知识库图标裸对象）在案。
4. **FR-2 撤销**（理由与重开条件见下节）。

**不这么做的后果**：把外部安装缺陷当本仓缺陷"修"——唯一能让外观恢复的手段是 pm 注册项顶替
`conversation.input.model` 席位（`replaceRisk = shadows-shipped-ui`），那是遮蔽真因、责任错位，
且不可能随版本存活；本设计明确拒绝这条路。

## FR-2 处置：撤销（附重开条件与将来契约） `serves: FR-2`

**原假设**："桌面端取不到控制台（DevTools 不可得），必须自建取证通道"。
**该假设已被本回合事实推翻**：用户直接取到控制台原文（`slot entry crashed in 'conversation.input.model': … React #130`）。

**现有取证手段已够用**（三步，全部零新增代码）：

| 步 | 手段 | 回答什么 |
|---|---|---|
| 1 | `Slots.listSubTree(root='conversation.input.model')` 看 `occupants[].active` | 席位是否**退役**（`false` = 崩过） |
| 2 | 控制台 `slot entry crashed in '<slot>': …` | 崩溃**原文与堆栈** |
| 3 | `npm pack <pkg>@<ver>` 与 app.asar 内同名文件逐符号对标 | 安装**是否自相矛盾** |

**故本期不新增**：客户端 tee、宿主路由、落盘 JSONL、配置开关（0 新接口 / 0 新数据 / 0 新依赖）。

**重开条件**（任一成立即按下方附录契约实施）：a) 出现确实拿不到控制台的环境；b) 出现三步法判不动的静默退役；c) 同类事故每月 ≥2 次。

### 附录 · 将来实施 FR-2 时的最小契约（本期不落地、不承诺） `serves: FR-2`

- 端点：`POST /dashboard/api/reqboard/client-error`
- 请求体：`{ ts:number, slot:string, registrant?:string, message:string, stack?:string, url:string, truncated?:boolean }`
- 响应：`200 {ok:true, file:string, bytes:number}`；`400` 非法 JSON；单条 >16KB 截断并置 `truncated:true`
- 落盘：`~/.dsh/state/pm-client-render-errors.jsonl`（append-only；单文件 ≤1MB，滚动保留 3 份）
- 失败语义：通道自身任何失败只 `console.warn` + 计数，**绝不影响 UI**

## 模块改动地图 `serves: FR-3, FR-4`

```
本仓改动（本期）
  docs/requirements/REQ-261004095621-c167/evidence/dsh-model-seat-crash.md  [新增] 缺陷报告（FR-3 交付物）
  docs/knowledge/entries/kb-00XX.md                                        [新增] pitfall：席位静默退役判别法（FR-1/FR-4）
  docs/knowledge/INDEX.md                                                  [改]   「坑」节追加一行指针
  src/client/page/register-knowledge.ts                                    [已改] 图标改 createElement（同类缺陷修复）
  tests/kb-client-page.test.ts                                             [已改] $$typeof 防呆断言
  运行时代码：0 新接口 / 0 新数据 / 0 新配置

不改动（红线）
  DSH 自带包（app.asar 内 ui-* 一律不动） · conversation.input.model 席位（不注册、不顶替）
```

## 接口与数据契约 `serves: FR-2`

- **本期新增接口：无**（FR-2 撤销）→ 无请求/响应契约、无新增字段、无版本兼容负担。
- 知识层条目是**文档产物**，不构成运行时契约；其结构遵循既有 KB 条目契约：
  front-matter 必填 `id / kind / status / title / one_liner / applies_when / updated / req`，正文四节
  （结论 / 适用条件 / 证据 / 失效条件）。
- 将来实施 FR-2 的最小契约见上节附录（本期不落地）。

## 迁移与兼容 `serves: FR-2, FR-3`

- **数据迁移**：无（不改台账结构、不新增落盘文件）。
- **兼容**：知识层为纯新增条目 + INDEX 一行；`pnpm kb:build --check` 口径不变。
- **回滚**：删掉新增条目与 INDEX 行即可；其余是本需求开工前已合入的 bugfix。
- **既有调用方**：无感知（无接口变化）。

## 测试策略与验收口径 `serves: FR-1, FR-4`

| 层 | 跑什么 | 期望 |
|---|---|---|
| 单测 | `pnpm vitest run tests/kb-client-page.test.ts` | 全绿；含"图标必须是合法 React 元素（`$$typeof`）"断言，反向演练（去掉 `createElement`）→ 必红 |
| 知识层 | `pnpm kb:check` | 退出码 0（生成物零漂移 + 九项自检 + 覆盖度） |
| 构建 | `pnpm build:client` | `[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| 类型 | `npx tsc --noEmit 2>&1 \| grep -c 'error TS'` | ≤ 144（2026-10-04 基线），改动文件零新增 |
| 端到端（用户侧，需重装客户端） | 点模型控件后 `Slots.listSubTree(root='conversation.input.model')` | `occupants[0].active === true`，连点 3 次不退化 |
| 报告可复核 | `evidence/dsh-model-seat-crash.md` §3.1 命令逐条重放 | 输出与报告一致 |

## 风险与回退 `serves: FR-3`

| 风险 | 影响 | 处置 |
|---|---|---|
| 重装后仍崩 | 说明还有第二个缺失 API | 用同一方法（提取 app.asar → `npm pack` 逐符号对标）再查，报告追加证据 |
| 用户暂时无法重装 | 需长期规避 | 报告 §5 给规避路径（`/model` 命令）；本仓**不**提供顶替席位的"假修" |
| 知识条目不准确误导后来人 | 把外部缺陷当本仓问题 | 条目结论明写"外部安装不一致"，并附本仓注册面清单作为判别依据 |

