# t-7a4d8b 文档位置根来源红字徽章·复核

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
文档位置根来源红字徽章·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007223647-da5d/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T16:20:57.497Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这一步做完，徽章与设计组件树逐条对上：文案一字不差、只读不抛、打开行为不变、样式归位，一处未定义形态的处理办法已留档说明。

### 完成项

- 组件树核对：frontend.md 写「DocLocationLine（既有）→ RootSourceBadge（叶子：rootSource ≠ req-root → 红字『地址可能不准（根来源：X）』）」——本卡按此落地（.dsh-pm-root-warn + data-doc-root-source 属性），文案逐字一致
- IF-7 核对：docLocationHtml 的「诊断只读不抛」保持（纯字符串拼接，无异常路径）；「红字是展示层增强，不改变打开行为」保持——打开仍调 openDocInSidebar / absolutizeDocPath，本卡未碰
- 样式归属核对：红字进 styles/files.ts（与文档位置行同族），符合 frontend.md §样式归属
- 偏离说明（如实记录）：视图自带 abs 但无 rootSource 的旧形态按「不加噪音」处理（视为地址已由权威方拼好）——设计未定义该形态；理由：面板既有调用方可能手搓视图，给可信地址加红字会变成误报
- 命令：npx vitest run tests/doc-root-badge.test.ts tests/doc-location-panel.test.ts → 17 例全绿；pnpm build:client → [verify-client] OK

### 改动文件

- `src/client/req-doc-location.ts`

### 下一步

测试段：跑本卡相关测试集并留命令与输出摘要

---
