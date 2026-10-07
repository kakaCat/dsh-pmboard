---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 用例与用户旅程（REQ-261007125552-32cb）

## 角色 `serves: FR-1`

| 角色 | 场景 | 本需求给的变化 |
|---|---|---|
| 窗口 agent | design 阶段写设计文档 | 必须产出接口清单（feature）/ 组件树（含 UI） |
| 窗口 agent | decomposing 阶段起草并提交拆分计划 | 按清单逐条对照拆卡；粗卡提交期即被点名 |
| 批准人 | 看板批准拆分计划 | 文档里有对照表可查「设计了什么 ↔ 谁来做」，不再盲批大卡 |
| 验收人 | accepting 逐项验收 | 卡粒度到接口/组件，验收锚点单点可判 |

## 主旅程：一个多接口功能走完新流程 `serves: FR-1, FR-2, FR-3, FR-4`

以「登录功能」（3 个接口：POST /login、POST /refresh、GET /me）为例：

1. **design**：agent 在 `design/interfaces.md` 写「接口清单」表（IF-1 login / IF-2 refresh / IF-3 me，各带签名与 serves）；`reqboard_submit(kind=design)` → 清单节门通过，人确认设计。
2. **decomposing 起草**：agent 按清单拆卡——契约卡 t0（定 3 接口契约，`granularity_exempt` 声明理由）+ 接口卡 t1/t2/t3（一卡一接口）+ 组装卡 t4；decomposition.md 写「接口清单 ↔ 卡 key」对照表（IF-1→t0,t1 …）。
3. **提交计划**：`reqboard_submit(kind=plan)` → FR-2 对照表门过（3 条目全覆盖、key 无悬空）、FR-4 接口数门过（t1~t3 各 1 接口；t0 走豁免且理由进 warnings）。
4. **批准落库**：人看文档批准（文档所见 = 批准所见，对照表就在文档里）→ 落库 5 张接口级卡。
5. **验收**：RTM 显示 FR 被多张卡接收（一对多）；每张卡验收锚点单点可判。

## 反旅程一：提交粗卡被拦 `serves: FR-4`

1. agent 提交「一卡实现 login+refresh+me 三个接口」的计划；
2. 接口数门拒：`plan_card_multi_interface`，报错列出识别到的 3 个接口与建议「一接口一卡、契约卡先行」；
3. agent 按建议重拆 → 重交 → 通过。

**看到什么**：错误发生在提交期（改文档），而不是实施期（改代码）。

## 反旅程二：设计了但没拆 `serves: FR-2`

1. 设计清单有 IF-1/2/3，对照表只覆盖 IF-1、IF-2；
2. 对照表门拒：`plan_interface_map_missing`，点名 `IF-3`；
3. 补卡或把 IF-3 在设计文档标「本轮不做」→ 重交通过。

## 反旅程三：存量需求不受影响 `serves: FR-6`

1. 规则生效前立项的需求，照旧形态提交计划（无清单节、无对照表）；
2. 生效口径门控跳过硬门；软门照常只给警告；
3. 落库成功，返回体带降级提示（不静默）。

## 边界场景 `serves: FR-1, FR-2, FR-5`

- **纯后端需求**：豁免组件树节（sides 不含 frontend），组件段对照表不判；
- **纯内部重构**：接口清单节写「不适用：无对外接口面」→ 清单节门放行、对照表门降级 warn；
- **确需一卡多接口**（契约卡/聚合卡）：`granularity_exempt` 写理由 → 放行、理由进 warnings；
- **迁移/批量脚本卡**（files 天然 >5）：FR-5 软门只警告不拒，人知情放行。

## 验收口径引用 `serves: FR-6`

- 门禁报错一律走统一信封（what/why/how）——本仓「失败要响亮」规范；
- 「新规则不追溯存量」口径与 `sidesGateFailure` / `docSectionGateFailure` 同源（`docQualityRulesApply`）；
- 软门哲学与超容量门同源：超了是风险不是错误，披露不拒绝。
