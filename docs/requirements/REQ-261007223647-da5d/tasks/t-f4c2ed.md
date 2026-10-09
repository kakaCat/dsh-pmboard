# t-f4c2ed 取消留痕与连续取消引导·研发

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
取消留痕与连续取消引导·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T16:08:59.204Z，窗口 session-3a744c5e-7560-408e-8db1-5f27fecc8150）

研发完成：三类留痕与连续取消升级落地。

### 完成项

- 留痕类型与计数助手落地；capture 三条分支（reject/cancel/timeout）接入；连续取消升级前置拦截
- 新增 check：只有 reject 拦弹框

### 改动文件

- `src/application/internal/capture-rejections.ts`
- `src/application/use-cases/CaptureRequirement.ts`

### 下一步

联调子卡

---
