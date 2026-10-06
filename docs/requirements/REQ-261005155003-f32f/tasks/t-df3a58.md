# t-df3a58 新建单一图标源模块 src/client/icons.ts·研发

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
新建单一图标源模块 src/client/icons.ts·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T12:31:36.608Z，窗口 session-941bbdc2-82e3-49c6-85ac-6bd1c5ef8fc2）

研发段完成：新建单一图标源模块（9 个内联 SVG 全族常量一致），配图标族用例 5 例，原型 6/6 实测 14×14，client bundle 重建通过。

### 完成项

- 新建 src/client/icons.ts（98 行）：TAB_ICON_SVG 六键 + GAP_DOT_SVG 三键 + 全族常量
- 全族常量 viewBox=0 0 16 16 / fill=none / stroke=currentColor / stroke-width=1.5 / 圆角端点 / aria-hidden
- 字符串不带尺寸与样式属性（按属性边界 grep = 0）、不带 6 位色值（= 0）
- tests/report-shell.test.ts 追加图标族用例群 5 例，既有断言一行未动
- 图标族用例 5 passed，整文件 51 passed，tsc --noEmit 全仓 0 error
- 原型对照：Tab 栏 6/6 个 svg 实测 14×14，尺寸确来自 CSS 令牌 --pm-icon
- 对照截图入 evidence/ui-t2-tabbar-1280-inflight-next.png
- pnpm build:client：verify-client OK（bundle=592282）

### 改动文件

- `src/client/icons.ts`
- `tests/report-shell.test.ts`
- `docs/requirements/REQ-261005155003-f32f/evidence/ui-t2-tabbar-1280-inflight-next.png`

---
