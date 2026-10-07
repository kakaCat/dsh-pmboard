# 评审报告（REQ-261007125552-32cb）

> 范围：拆分粒度细化——设计先行（清单节硬门）+ 对照表门 + 接口数门 + 形态软门 + RTM 回归。
> 评审方式：逐卡复核子卡（对照设计文档逐条核对）+ 链尾总复核。结论：**通过**。

## 逐卡复核结论

| 卡 | 结论 | 依据 |
|---|---|---|
| t1 粒度纯函数与阈值 | 无偏离 | 词法契约与 design/interfaces.md §接口声明词法逐条一致（复核记录见 tasks/t-da1879.md） |
| t2 豁免字段透传 | 1 处设计文档修正 | data-model.md「透传进 PlanTaskDraft」改为「门禁读 rawTasks，不落库」——与「不落库」契约一致（tasks/t-29ef80.md） |
| t3 门禁 wiring 三入口 | 1 处有意偏差 | landApprovedPlan 的粒度警告并入既有 warning 字段（内部返回结构，不加键）；披露不静默语义保住（tasks/t-adca1e.md） |
| t4 清单节门 | 1 处有意放宽 | 「不适用：」判定为文档级而非节级（不做 markdown 节级解析），语义等价且有测试锚定（tasks/t-fb8d1c.md） |
| t5 提示词档/模板 | 2 处偏差 | ① doc-section-parity.mts 无挂载点（只管 brainstorming 模板），词法同口径由 template-gate-probe 承担；② light 档 2500 字符硬预算塞不下规则全文——压缩进类型档（一接口一卡/组件级），全文在 heavy.md §3.5（tasks/t-4c4e32.md + t-3024d9.md） |
| t6 测试 | 无偏离 | TC-1~12 全覆盖（tasks/t-e9cb83.md） |
| t7 回归验收 | 通过 | pnpm test 95 ≤ 基线 96；tsc 0；prompts:check 绿 |

## 实施期事故与处置（诚实记录）

1. **对照表列名词法冲突**（提交计划时实测撞上）：key 列最初叫「计划 key」被任务表判据误认 → 定名「接收卡 key」，
   词法避让写进 design/interfaces.md §文档格式契约三与 decomposition 模板注释。
2. **light 档预算红线**：我的提示词增量把 light 档推过 2500 字符上限（prompt-tiers 红）→ 压缩类型档至预算内
   （design 2481 / decomposing 2493），P1 基线按既有机制（dump-stage-prompts.mjs）重刷留痕。
3. **既有工作区债核对**：decompose-tools 5 条 + plan-mode 1 条失败经 git stash 隔离证实非本次引入；
   error-code-inventory 3 条既有红顺手修复（分级 + 覆盖重算，含并发窗口的 2 枚原型码）。

## 风险残留

- `footprintFilesSoftMax=5` 与 `maxInterfacesPerCard=1` 均为待标定值（注释已标，标定闭环另立需求）；
- 接口声明词法只认声明式写法，散文里隐晦的多接口描述漏判——由提示词档与形态软门兜底（设计时已裁定：宁可漏判不可误锁）。
