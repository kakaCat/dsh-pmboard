# t-95fafa 同步 implementing/heavy.md 镜像·研发

> 需求：REQ-261008143952-65dd 更新 vendor superpowers 分片到本地最新版

## 在做什么
同步 implementing/heavy.md 镜像·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-08T10:37:52.577Z，窗口 session-d7422892-bcde-406a-a95e-3c0868cdd93c）

镜像同步完成：implementing/heavy.md 已与新 executing-plans 逐字节一致，镜像门禁的镜像部分转绿。

### 完成项

- 把新 executing-plans 原样复制为 src/domain/prompt/fragments/implementing/heavy.md
- 隔离验证：vendorMirrorProblems() 返回 0 条（镜像契约无漂移）
- 三项映射逐项对齐：implementing 20405/20405、accepting 3646/3646、archived 7781/7781
- diff -q 两份无输出 = 逐字节一致
- accepting 与 archived 镜像确认未被本卡触碰

### 改动文件

- `src/domain/prompt/fragments/implementing/heavy.md`

### 下一步

t4 重跑生成器后 check-prompt-fragments 才会整体 exit 0（当前剩余红是产物同步，属 t4）。

---
