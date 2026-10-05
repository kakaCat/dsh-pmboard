# t-8f6abf 立项与计划落库只写自己项目，写错地方要当场报错·复核

> 需求：REQ-261001203710-0fbf 计划落库未按需求工作区校正根：queue.json 与任务卡被写进另一个工作区

## 在做什么
立项与计划落库只写自己项目，写错地方要当场报错·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-02T11:40:20.410Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

复核结论：两条偏离需要你知道——① 守卫改成「只拒绝、不搬动」，这是被一次真实事故迫出来的：代为校正会把文件搬进更错的地方；② 顺手修了「项目根一出生就记错」这个上游缺陷，它超出卡片字面范围但不修就达不到本卡目的。其余与卡片一致。

### 完成项

- 偏离项 1（设计取舍，已用事故验证）：卡片写「落盘前 projectRootOf(req, …)；若不一致 → 抛」。实现为**只核验、不代为重定向**的独立守卫 ensureWritableProjectRoot。第一版实现成「先校正、再核验」，实测把文件重定向写进了真实仓库（51 个污染目录，已清理）——因为记录声明的根本身可能是错的。结论：读侧可校正（最坏读空可重试），写侧只许拒绝
- 偏离项 2（卡外但必要，属伴随修复）：改动了 CaptureRequirement.ts 与 CreateRequirement.ts 的 sessionCwd 回落口径（优先取实际在用的工作区，process.cwd() 降为最后兜底）。卡片未要求，但不改则记录的项目根一出生就是错的，本卡目标（写对地方）不可能达成。已在需求评论与子卡汇报中如实留痕，供验收时判断是否算扩范围
- 偏离项 3（卡片未提的边界）：新增 isAbsoluteRoot 并在守卫里用它防**误拒**——只有两侧都是绝对路径才判错配，相对写法（如测试替身返回 '.'）与绝对路径可能指同一目录，判不一致就是误拒（实测踩到过）
- 无偏离项：错误码 REQBOARD_PROJECT_ROOT_MISMATCH、两个绝对路径、返回体 usedProjectRoot（capture 用 used_project_root 落地并已登记输出契约）、拆分评论追加 [项目根] 本次写入根=<abs>——与卡片与 design/interfaces.md 一致
- 复核证据：三条验收命令全过；tests/project-scope.test.ts 21 passed；全量 97 failed / 2942 passed（与基线持平）；类型 187 ≤ 192；仓库目录数 22（无残留污染）

### 改动文件

- `src/application/internal/support.ts`
- `src/application/internal/plan-landing.ts`
- `src/application/use-cases/CaptureRequirement.ts`
- `src/application/use-cases/CreateRequirement.ts`

---
