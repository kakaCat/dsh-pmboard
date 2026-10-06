# t-e0b5bd 落地浅色岛令牌块并移除宿主深色覆盖·复核

> 需求：REQ-261005155003-f32f 需求详情页 UI 视觉与信息层级优化（ui-ux-pro-max 规范）

## 在做什么
落地浅色岛令牌块并移除宿主深色覆盖·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-05T12:24:26.628Z，窗口 session-941bbdc2-82e3-49c6-85ac-6bd1c5ef8fc2）

复核段完成：五条验收逐条独立复跑通过；两处设计文档口径差按多数派落地并登记，无其它偏离。

### 完成项

- 复核①：五名宿主令牌引用 0 命中（grep 退出码 1）
- 复核②：data-ds-dark-theme 0 命中，覆盖块已整块移除
- 复核③：rgba(128,128,128 0 命中；--pm-text3 实值 #86868b 且注释写明只许非文本
- 复核④：独立重跑 headless Chrome，?theme=dark&v=next 与 ?v=next 两张 PNG sha256 相同
- 复核⑤：pnpm build:client 退出 0，[verify-client] OK
- 复核⑥：改动面核对——近期被改的其它 src 文件属别的窗口在途工作，本卡只用标记 grep 锁定 report.ts
- 偏离登记：tint 三值按 frontend/interfaces/test-cases 实值落（data-model 写别名，按多数派）
- 偏离登记：--pm-line-soft 按卡与 t8 的 grep 删名（data-model 记为保留，按多数派）
- 无未处置偏离

### 改动文件

- `src/client/styles/report.ts`

---
