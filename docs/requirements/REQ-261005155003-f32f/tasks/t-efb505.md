# t-efb505 新建单一图标源模块 src/client/icons.ts

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
新建单一图标源模块 src/client/icons.ts

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
① `grep -c 'viewBox=' src/client/icons.ts` = 9；② `grep -c -e 'width=' -e 'height=' -e 'style=' src/client/icons.ts` = 0，且 6 位十六进制色值 0 命中；③ `grep -c 'aria-hidden' src/client/icons.ts` = 9 且每个值恰 1 个 <svg>；④ `npx vitest run tests/report-shell.test.ts -t '图标族'` 全绿；⑤ 原型对照（可失败）：权威原型 prototypes/detail-ui-v3.html#FR-1（1280 档 · 在途，--window-size=1280,800）实测 Tab 栏内 <svg> 宽高 14±1（6/6 命中），且本模块字符串无尺寸字面量；对照截图与差异说明落 docs/requirements/REQ-261005155003-f32f/evidence/。⑥ `pnpm build:client` 含 [verify-client] OK（C-12）。

## 实施方案（implementation）
新建 src/client/icons.ts：导出 TAB_ICON_SVG 与 GAP_DOT_SVG；键取既有 ReportTabKey（见 src/client/views/report-tabs.ts 的定义）与 ReportGap severity（见 src/client/views/report-band.ts 的定义），类型用 import type。全族常量 viewBox=0 0 16 16、fill=none、stroke=currentColor、stroke-width=1.5、stroke-linecap=round、stroke-linejoin=round、aria-hidden=true；字符串内不带 width/height/class/style/颜色字面量。本卡不接调用方（接线在 t3/t12）；图标族断言落 tests/report-shell.test.ts 的新增用例群（-t 图标族）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T12:32:53.800Z，窗口 session-941bbdc2-82e3-49c6-85ac-6bd1c5ef8fc2）

t2 完成：单一图标源模块落地（9 个内联 SVG，全族常量一致、无尺寸与色值字面量），图标族用例 5 例与全仓测试基线均未劣化，原型 6/6 实测 14×14。

### 完成项

- 新建 src/client/icons.ts：TAB_ICON_SVG 六键 + GAP_DOT_SVG 三键，全族常量一致
- tests/report-shell.test.ts 加图标族用例群 5 例
- 六条验收逐条实测：viewBox=9 / 属性边界尺寸=0 / 色值=0 / aria-hidden=9 / 原型 6×14×14 / build OK
- 三段子卡（研发/复核/测试）全部收口
- 两处裁定已落：验收②改按属性边界并订正 TC-2；GAP_DOT 圆环偏差交 t12 复核
- 范围自证：只改 icons.ts 与 report-shell.test.ts

### 改动文件

- `src/client/icons.ts`
- `tests/report-shell.test.ts`
- `docs/requirements/REQ-261005155003-f32f/design/test-cases.md`
- `docs/requirements/REQ-261005155003-f32f/evidence/ui-t2-tabbar-1280-inflight-next.png`

### 下一步

t3（Tab 接线与语义）依赖本卡导出；t12 用 GAP_DOT_SVG 并决定是否覆写 fill 成实心点（原型是实心 emoji 圆）

---
