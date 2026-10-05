# t-ca13b6 退路先修好：v10 分片导回 legacy v9 单册·测试

> 需求：REQ-261002161439-277d reqboard 数据层重构：台账分片 + 读放大治理 + 存储端口化（SQLite 就绪）

## 在做什么
退路先修好：v10 分片导回 legacy v9 单册·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T09:40:28.833Z，窗口 session-8c9338a3-fc36-4c3a-bda1-d73c7e78d783）

测试子卡：回滚测试 7 条全绿（覆盖卡上全部验收条目），typecheck 187 与基线一致。

### 完成项

- 卡上验收命令：npx vitest run tests/reqboard/rollback-v10.test.ts → 7 passed
- A11：往返后条数与 id 集合与迁移前一致，且逐项内容等价
- 归档需求随导出回到单册，comments 与 archive 内联完整
- 导出文件 schemaVersion 为 9，且不含三个计数字段
- dry-run 不写文件；回滚不碰数据根；回滚后可再次迁移
- npx tsc --noEmit → 187 与基线一致，我的文件零错误

### 改动文件

- `tests/reqboard/rollback-v10.test.ts`

### 下一步

本卡收尾后由 t8（端口切换）接手，它是本需求唯一的原子大卡。

---
