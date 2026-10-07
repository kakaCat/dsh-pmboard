# t-ebc36c 裁决行新控件：理由输入、原文保留、归档门可见（UI）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
裁决行新控件：理由输入、原文保留、归档门可见（UI）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
① npx vitest run tests/client-verify-disposition.test.ts tests/client-view.test.ts tests/stage-detail.test.ts 退出码 0；② pnpm build:client 输出含 [verify-client] OK（关键符号齐全、样式归属章在场、CSS 分片完整）；③ 既有四个 DOM 钩子语义不变：.dsh-pm-vsheet / .dsh-pm-vitem[data-item-id] / .dsh-pm-verdict-btn 单选 / .dsh-pm-vitem-opinion；④ 新增钩子在场：.dsh-pm-vitem-change-reason 与 data-superseded="1"，且被覆盖行 HTML 同时出现「原实测结果」字样；⑤ 未复核 行徽标文本 === ITEM_STATUS_TEXT.unverified（不自造第二份文案）；⑥ 原型对照（可失败、需人见证）：打开看板对照权威原型 prototypes/verify-disposition.html#FR-3，不看颜色时 未复核 与 已通过 仍可辨（徽标文字不同）——该项标 needsHuman 由人填结论

## 实施方案（implementation）
改 src/client/views/panels/verify.ts 与 src/client/stage-panel.ts：新增共用的同一段渲染（禁止复制粘贴），为 resultSource==='agent' 且非 needsHuman 的项渲染 .dsh-pm-vitem-change-reason 理由输入（编辑预填值时才要求必填），被覆盖项渲染 data-superseded="1" 的「原实测结果（已被覆盖）」留存展示；needsHuman 项与 gapKind 项的就地拒收提示复用同一文案源。改 src/client/board-mount.ts：在 case 'submit-verdicts' 里收集 changeReason（判据=输入框当前值 ≠ defaultValue）并在缺理由时就地拦下点名该项；保留既有 missingFailed/missingHuman 两条守卫不动。改 src/client/styles/board.ts：新控件样式复用既有令牌（不新增色板），未复核 与 已通过 的区分不得只靠颜色（徽标文字必须不同）。新增 tests/client-verify-disposition.test.ts。验证：npx vitest run tests/client-verify-disposition.test.ts tests/client-view.test.ts tests/stage-detail.test.ts；pnpm build:client 必须含 [verify-client] OK。

## 上游产出摘要（dependsSummary）
- 覆盖原子写入与两通道透传

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T13:22:46.847Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

t5 完成：裁决行两处渲染共用同一套覆盖控件，判据三处同构；并修掉一枚会卡验收的原型引用地雷。

### 完成项

- 覆盖控件在 verify.ts 里是**唯一实现**，stage-panel.ts 导入复用；并加了源码锁（stage-panel 自己不再出现新控件的类名字面量）
- 覆盖判据三处同构：提为域层单一谓词 isResultOverride（看板收集 / 弹框补问 / 应用层写入共用），避免「UI 不问、服务端要」的陷阱
- board-mount 新增第三条守卫：候选行 + 人真的改了预填值 = 覆盖 ⇒ 理由必填，缺理由就地拦下并点名；两条既有守卫不动
- 样式复用既有令牌、不新增色板；被取代原文用左侧细边弱化但保持可读（不划掉）
- 「未复核」文案例为单一字面量 UNVERIFIED_TEXT，行级 chip 与逐项徽标共用（消掉一处既有漂移源）
- 导出 ITEM_STATUS_TEXT 使「未复核 徽标不自造第二份文案」这条验收可断言
- 补上 api.ts 的 changeReason 字段声明（联调抓出的契约缺口：不声明时传变量绕过 TS 检查、字段无契约）
- **修掉一枚会让验收被拒的原型引用地雷**：frontend.md 里「旧 prototypes/detail.html 不得引用」会被原型门当成一次引用判 prototype_version_conflict（该门不认否定语）；已改为不写路径字面量，并真跑原型存在门+版本门确认 OK
- pnpm build:client → [verify-client] OK（bundle=721645 bytes）
- 四段子卡链全部 done：研发 / 联调（收集链契约 8/8）/ 复核（判据修正后 3/3 + 原型双门实跑）/ 测试（278 例全绿、集合差零新增）
- 偏离登记：理由输入的展开时机是**提交时就地展开并拦下**（渲染是纯字符串函数、挂不了监听），核心要求由前端守卫 + 服务端权威校验双保险
- 需人见证项（留待验收）：不看颜色时「未复核」与「已通过」是否可辨——已由徽标文字不同保证，实际观感留给人

### 改动文件

- `src/client/views/panels/verify.ts`
- `src/client/stage-panel.ts`
- `src/client/board-mount.ts`
- `src/client/styles/board.ts`
- `src/client/api.ts`
- `tests/client-verify-disposition.test.ts`
- `docs/requirements/REQ-261006201920-2adc/design/frontend.md`

### 下一步

批 5 开工 t6：迁移兼容 + 存量 2005 张卡零改写对照 + test-baseline 差集为空收口

---
