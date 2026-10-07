# t-c8eb8f archive.md 写盘、幂等与清单补登（渲染失败即整体拒绝、台账零写入）·联调

> 需求：REQ-261006201841-944d 归档校验与知识层覆盖度加固（合并去向存在性 + 归档沉淀覆盖度 + 归档目录呈现）

## 在做什么
archive.md 写盘、幂等与清单补登（渲染失败即整体拒绝、台账零写入）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-06T13:20:40.475Z，窗口 session-7bda6cee-8918-4b81-90e1-8536ee47f76d）

联调段完成：回执契约与目录对账接线一致，二次提交幂等已实测。

### 完成项

- 回执 resolved_targets 的 root / by / attributed 与桩记录一致
- archive.md 进目录对账「已列」侧，不触发未列闸门
- 复跑 archive-manifest-write 6/6 与 archive-manifest-render 17/17 全绿

### 改动文件

- `src/application/use-cases/SubmitArchive.ts`

### 下一步

复核段：核对失败路径与零写入契约

---
