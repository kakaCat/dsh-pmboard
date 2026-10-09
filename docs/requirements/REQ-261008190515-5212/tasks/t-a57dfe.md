# t-a57dfe 让 implementing 退出 vendor 镜像表·研发

> 需求：REQ-261008190515-5212 把 implementing 移出 vendor 镜像并改写自写实施档

## 在做什么
让 implementing 退出 vendor 镜像表·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/prompt-tiers.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-08T11:18:20.879Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

研发段：脚本与测试两处同源映射副本同批删掉 implementing 项，映射只剩 accepting 与 archived

### 完成项

- 脚本 VENDOR_MAIN_SKILLS 删项并补裁定注释
- 测试同源副本删项并补注释
- node -e 打印 keys = accepting,archived
- grep -c executing-plans 两文件均 0
- npx vitest run tests/prompt-tiers.test.ts 37 passed

### 改动文件

- `scripts/inline-prompt-fragments.mjs`
- `tests/prompt-tiers.test.ts`

### 下一步

复核段逐字比对两处副本

---
