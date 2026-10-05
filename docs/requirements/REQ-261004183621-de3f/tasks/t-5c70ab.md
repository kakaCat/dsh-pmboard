# t-5c70ab 端到端演练与交付证据·测试

> 需求：REQ-261004183621-de3f 归档清单自动收录需求目录内文件（未列即拦或自动补）

## 在做什么
端到端演练与交付证据·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-04T10:55:35.768Z，窗口 session-a1f04215-5a72-4eb9-8633-2259d055f3a3）

这一步做完，证据三件套齐了、用例账也清了：这次一共新增 51 条用例（豁免规则、对账闸门、补录、看板渲染、配置、兼容），加上演练脚本与门禁汇总，验收人拿到的是一份能自己跑的清单。

### 完成项

- 证据完整性核对：演练输出、门禁汇总、兼容明细三份在场且含命令原文与实测数字
- 本需求新增 9 套用例 58 条：exemptions 21 / reconcile 8 / amend 8 / manifest-view 6 / gate-config 3 / compat 5 + 既有回归
- 对外契约核对：工具入参 unlisted_ack、出参 reconcile、新工具 reqboard_archive_amend 均在 schema 内（tools-schema 50 条绿）

### 改动文件

- `docs/requirements/REQ-261004183621-de3f/evidence/gates.txt`
- `docs/requirements/REQ-261004183621-de3f/evidence/compat.txt`
- `docs/requirements/REQ-261004183621-de3f/evidence/archive-reconcile-drill.txt`

### 下一步

提交验收材料（reqboard_submit kind=verification）。

---
