# 前端设计（REQ-261007191737-0eb5）

> 前端范围：项目看板的**验收单面板**（`src/client/views/panels/verify.ts` 渲染 + `src/client/board-mount.ts` 收集）。
> 会话弹框由宿主渲染，本包只负责发问（见 `design/backend.md` S-3），不在此描述视觉。

## 原型页面 <!-- serves: FR-1, FR-2, FR-4 -->

权威原型 = `prototypes/detail.html`（`prototypes/INDEX.md` 中**唯一** `authoritative` 行），本需求的界面改动逐 FR 对照：

| 原型锚点 | 画的是什么 | 落到代码 |
|---|---|---|
| `prototypes/detail.html#FR-1` | 人工项零输入勾「通过」即成立（改前/改后并排） | `verify.ts` 行渲染置 `data-proxy-candidate="1"`；`board-mount.ts` 放行 |
| `prototypes/detail.html#FR-2` | 该行显示来源徽标「agent 代写（人已确认）」 | `verify.ts` 徽标节点 + `VerificationDoc.ts` 文档标注 |
| `prototypes/detail.html#FR-3` | 改前：填「通过」两字被拒（`opinion_required`） | 无 UI 改动（错误仍由服务端返回，看板 `window.alert` 既有路径） |
| `prototypes/detail.html#FR-4` | 提交前就地补问弹框（题干含 itemId + 样例） | 弹框由后端发问；看板侧提示文案升级（`board-mount.ts:1025-1028`） |
| `prototypes/detail.html#FR-5` | 开关关闭时回到改前形态 | 渲染侧由 `humanProxyEnabled` 决定是否置候选属性 |

几何量契约（原型页内 `proto-geometry`，1280px 宽 / inflight）：来源徽标宽 **152px**、验收单行高 **72px**、弹框第 2 问输入框高 **96px**、补问弹框高 **308px**、一屏整行可见 **5** 条。实现时徽标按 152px 固定宽（同列对齐、不随文案抖动），行高维持 72px。

相关裁定：徽标只做**文本 + 符号**双通道表达（D-4 的界面投影），不做纯色块；「留空即采纳」的措辞对应 D-1；不提供「一键全部代写」按钮对应 D-2（裁决动作必须逐项由人发起）。

## 组件树 <!-- serves: FR-1, FR-2, FR-4 -->

叶子 = 拆分阶段的组件级拆卡粒度单位（一卡一叶子，不合并）。

```
验收单面板 VerifyPanel（src/client/views/panels/verify.ts）
├─ 汇总条 SummaryBar                         叶子
├─ 验收单容器 .dsh-pm-vsheet
│  ├─ 行 VerifyRow（.dsh-pm-vitem，每项一行）
│  │  ├─ 行标题 ItemTitle                     叶子（criterion / 来源标题）
│  │  ├─ 结论选择器 VerdictRadio              叶子（通过 / 不通过）
│  │  ├─ 结论输入框 OpinionInput               叶子（人工项：留空＝采纳 agent 事实）
│  │  ├─ 来源徽标 ProxyBadge                   叶子（新增：「agent 代写（人已确认）」）
│  │  └─ 变更理由输入 ChangeReasonInput        叶子（既有，覆盖 agent 原文时出现）
│  └─ 提交按钮 SheetSubmit                    叶子
└─ 提示区 SheetNotice                         叶子（缺项点名 + 可照抄样例，文案升级）
```

弹框通道不在本树内（宿主渲染），但它消费同一份判据结论（IF-1/IF-3），因此**不产生第二套组件真相**。

## 页面与组件（编号表） <!-- serves: FR-1, FR-2, FR-4 -->

| 组件 id | 位置 | 职责 | serves |
|---|---|---|---|
| C-1 | `verify.ts:574-600` 行渲染 | 渲染一行：单选 + 输入 + （新增）候选属性与徽标 | FR-1, FR-2 |
| C-2 | `verify.ts` 新增徽标片段 | 文本徽标「agent 代写（人已确认）」，宽 152px | FR-2 |
| C-3 | `board-mount.ts:991-1034` 收集 | 逐行收集 verdict；`missingHuman` 只对 non-candidate 行生效 | FR-1, FR-4 |
| C-4 | `board-mount.ts:1025-1028` 提示 | 缺项点名 + 一句可照抄样例 | FR-4 |
| C-5 | `verify.ts` 占位文案 | 人工项输入框提示改为「已有 agent 事实文本：留空将通过采纳它；你写了就以你写的为准」 | FR-1 |

## 状态管理 <!-- serves: FR-1, FR-2 -->

- **无新增状态**：看板是「DOM 即状态」的既有形态，判据结论通过 `data-proxy-candidate` 落在 DOM 上，收集时直读。
- 判据在**渲染期**算一次（`humanFactForProxy`），收集期只读属性——这是「一处判据」在 client 侧的落法（不复制 `HAS_HUMAN_FACT` 正则）。
- 服务端返回的 `opinionSource` 只用于**展示**（徽标），不参与客户端的任何分支判断：写路径的真相在台账。

## 样式与主题 <!-- serves: FR-2 -->

- 徽标用既有令牌（文本 + 边框），**不靠颜色单独表意**（无障碍：文字本身已说明来源）。
- 交付物是 `lib/client.js` 内的样式分片；改动若触及样式分片，须保证分片以模板字符串收尾（KB C-12 的失败模式）。

## 依赖与第三方库 <!-- serves: FR-1 -->

无新增依赖。改动只用既有 DOM API（`querySelector` / `dataset`）与项目自身的渲染辅助函数。

## 生效与刷新 <!-- serves: FR-1, FR-2 -->

- client 改动必须 `pnpm build:client`（期望 `[verify-client] OK`，产物 `lib/client.js`），并**刷新看板页面**；宿主缓存旧 bundle 时需重启宿主（本仓 KB `kb-0006` / conventions C-12）。
- host 侧改动另有 `pnpm build` + 重启宿主（见 `design/backend.md`）。
- 验收读数：`grep -c "data-proxy-candidate" lib/client.js` ≥ 1。

## 关键决策与取舍 <!-- serves: FR-1, FR-4 -->

| 取舍点 | 否掉了什么 | 为什么 |
|---|---|---|
| 用 `data-*` 属性传递判据结论 | 收集侧再跑一次正则；或让 client 回传 agent 文本 | 前者是第二份真相；后者让 client 参与「什么算事实」的判断，且服务端仍要再判一次（等于两处） |
| 徽标只在行内、不做全局统计 | 在汇总条上写「本单 N 项由 agent 代写」 | 汇总数字会诱导人「看统计下结论」；来源标注的目的是**逐项可辨**，不是提供批量放行信号（D-2） |
| 不改「不通过必须写意见」的既有前端守卫 | 顺手统一成「都能留空」 | 不通过的意见是返工卡的输入，留空会让返工卡无内容；与本需求无关，不扩大范围 |

## 技术方案与亮点 <!-- serves: FR-2 -->

- **零新状态、零新依赖**：一处属性 + 一处徽标 + 一处提示文案，改动面小且可单独回归。
- **来源可见但不打扰**：徽标是纯标注，不改变任何交互路径；人写了文本时它自然不出现（`data-proxy-candidate` 不置位）。
