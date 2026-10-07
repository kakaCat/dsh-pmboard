---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 测试用例设计（REQ-261007160829-1991）

## 功能测试用例 `serves: FR-1, FR-2, FR-3, FR-4`

| 编号 | 层级 | 用例（做什么 → 看到什么） | 实际文件 | validates |
|---|---|---|---|---|
| TC-1 | 单元 | 纯函数判落点：无文本 / 有文本有锚点 / 有文本无锚点 / 人工项有文本，四种输入各得预期 `{status, reason}` | tests/verdict-downgrade-reason.test.ts | FR-2 |
| TC-2 | 单元 | 降级写原因：`unverified` 项的 `unverifiedReason` 取值正确，且 `passed` / `failed` 时该字段被清空 | tests/verdict-downgrade-reason.test.ts | FR-2 |
| TC-3 | 集成 | 提交 `kind=verification`：某普通项 result 无锚点 → 拒绝并**点名该项**，验收单零改动；补锚点后提交成功 | tests/result-anchor-submit.test.ts | FR-1 |
| TC-4 | 集成 | 排除项不被误伤：`needsHuman` 项与系统缺口项的无锚点 `result` 仍可提交 | tests/result-anchor-submit.test.ts | FR-1 |
| TC-5 | 集成 | 人自填无锚点 → 拒绝（错误码 `REQBOARD_VERDICT_ANCHOR_MISSING`），台账 `version` 未变；改成带锚点文本 → `passed` | tests/verdict-human-anchor-reject.test.ts | FR-3 |
| TC-6 | 集成（回归） | 零输入通过不误伤：文本取自 `item.result` 且带锚点 → `passed`；取自 `item.result` 但无锚点 → `unverified(anchor_missing)`（**不**被当成人工自填拒绝） | tests/verdict-human-anchor-reject.test.ts | FR-2, FR-3 |
| TC-7 | 契约 | 字段镜像不漂移：`protocol.VerificationItem` 与 `SheetItemLike` 的 `unverifiedReason` 同名同值域；该字段**不在**任何必填清单里（可选，缺省 `undefined`） | tests/accept-verdict-reason-contract.test.ts | FR-2 |
| TC-8 | 单元 | 文案单点：弹框第 2 问题干含「命令 / 路径 / 计数」；两处回执都调用同一函数（源码级断言：工具层 / HTTP 层出现写死的「未复核」句即红） | tests/accept-result-question-wording.test.ts | FR-2, FR-4 |

## 测试覆盖度统计 `serves: FR-1, FR-2, FR-3, FR-4`

| 条款 | 覆盖用例 | 覆盖方式 |
|---|---|---|
| FR-1 | TC-3, TC-4 | 提交侧拒绝 + 排除项不误伤 |
| FR-2 | TC-1, TC-2, TC-6（部分）, TC-7, TC-8（部分） | 判定 / 落账 / 清空 / 镜像 / 回执文案 |
| FR-3 | TC-5, TC-6 | 人工自填拒绝 + 零输入不误伤 |
| FR-4 | TC-8 | 题干形态提示 |

读数口径：全部为 `npx vitest run <实际文件>`，退出码 0 且无 skip。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3`

- **为什么不用 E2E 兜底**：本需求是纯服务端判定与文案，链路可被集成用例完整覆盖（提交 → 台账 → 裁决 → 回执）；E2E 只会重复同一口径。
- **为什么 TC-6 必须单独存在**：FR-3 的拒绝逻辑最容易误伤「零输入通过」（那条路的 `opinion` 与 `result` 逐字相同），这条用例是防回归的锚点。
- **为什么 TC-7 用「不在必填清单里」这种反向断言**：本仓既有契约测试的做法——只断言「读得到 + 可选」，避免把字段偷偷升级成必填而无人察觉。
- **为什么 TC-8 要扫源码字面量**：文案单点的失效形态是「有人又写了一句」，只有源码级断言能拦住。
