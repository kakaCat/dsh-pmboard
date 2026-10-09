# t-f058bc 让 implementing 退出 vendor 镜像表·复核

> 需求：REQ-261008190515-5212 把 implementing 移出 vendor 镜像并改写自写实施档

## 在做什么
让 implementing 退出 vendor 镜像表·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261008190515-5212/design/` 逐条核对；`npx vitest run tests/prompt-tiers.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-08T11:18:31.284Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

复核段：两处副本无分叉，裁定注释与审计指针齐备，镜像断言组自动收敛到 2 节点

### 完成项

- 逐字比对两处同源映射副本：均只剩 accepting 与 archived 且顺序一致
- 核对裁定注释同批对齐，并各自指向 ATTRIBUTION 档案作为审计指针
- 确认 ④ 镜像断言组由映射表驱动，移项后自动只剩 2 条

### 下一步

测试段跑 prompt-tiers 全量断言

---
