# 实现复核报告（REQ-261002140814-1a5d）

> 复核范围：`src/application/use-cases/ClearPause.ts`、`tests/clear-pause-lossless.test.ts`、`tests/output-contract.test.ts`
> 复核依据：需求文档 FR-1/2/3 + `design/interfaces.md`（三条实现契约）+ `design/data-model.md`（回执契约）
> 复核方式：对照设计逐条核对实现与证据（不只看测试是否绿）

## 1. 结论

**可交付验收**：三条功能点全部落地，实现与设计契约**无偏离**；一处未验证项（真实调用端到端）与三处边界外发现已如实登记。

## 2. 逐条核对

| 条款 | 设计要求 | 实现落点 | 证据 | 判定 |
|---|---|---|---|---|
| FR-1 | 回执无损 + 不说假成功 | 闭包变量在变更器内捕获；条件展开产出 `previous_activation`；失败判定按 `changed.requirements` | 用例 7 passed；旧实现 4 failed | ✅ 无偏离 |
| FR-2 | 留痕写 `body` | `comments.push({ id, body, createdAt, createdBy })` | 用例断言 body 非空且无 `text` 键；`grep text:` 无输出 | ✅ 无偏离 |
| FR-3 | 回归 + 门禁补洞 | 新增 7 条用例；契约断言删 `undefined` 豁免 + 反向自检 | 契约门禁 28 passed（3 条既有失败另计）；退修必红 | ✅ 无偏离 |

## 3. 契约一致性（对照 `design/interfaces.md`）

| 契约 | 要求 | 实测 | 判定 |
|---|---|---|---|
| C1 | 前值在变更器内捕获，禁止从 `mutate()` 结果读 | 实现即如此；类型检查 TS2339 消失可证 | ✅ |
| C2 | 缺值条件展开（整体省略键） | 用例 UC-2 断言 `hasOwnProperty === false` | ✅ |
| C3 | 变更器返回 `LedgerChange` | 返回 `{ requirements: [req] }`；TS2345 消失 | ✅ |
| 错误码 | 三个 code 语义与文案不变；`REQBOARD_MUTATION_FAILED` 由死分支变活 | UC-3/UC-4 断言两码 + 一条活分支 | ✅ |
| 签名 | 工具名/参数/`output.schema` 字段集合不动 | 未改动工具壳；`tools-schema` 42 passed | ✅ |
| 数据契约 | 无 schema 变更、无迁移、无回填 | 无 schemaVersion 改动；无迁移脚本 | ✅ |

## 4. 证伪有效性（这次修复"退得回去吗"）

| 证伪项 | 做法 | 结果 |
|---|---|---|
| 关键断言不是恒真 | 把 `ClearPause.ts` 临时还原成旧实现（`git show HEAD:` 版本，md5 校验还原） | 同一用例文件 **4 failed / 3 passed**（修后 7 passed） |
| 门禁不是恒真 | 给契约断言喂 `{ previous_activation: undefined }` | 必红（豁免删除前此处为绿） |
| 留债登记不会烂在表里 | 留债项在"修好"时必须变红（强制摘牌） | 已按此设计；到期 2026-10-16 |

## 5. 未验证项（唯一）

| 项 | 状态 | 理由与复核路径 |
|---|---|---|
| 真实调用端到端（回执无报错 + 看板可见留痕） | **未验证** | 运行中的宿主持有启动时加载的模块，`pnpm build` 不会热加载（见项目手册「产物生效链」）；本窗口不重启（会中断正在进行的对话）。复核路径：重启宿主后在 armed 需求上调 `reqboard_clear_pause`，核对回执含 `previous_activation` 且无 `value is not lossless JSON`，并查看板阶段评论 |

## 6. 边界外发现（登记，不在本需求修）

| # | 发现 | 位置 | 处置建议 |
|---|---|---|---|
| D-1 | `reqboard_ask_confirm` 非肯定项且未填意见时返回 `user_feedback: undefined`，真实调用同样会被判非法回执——人的答复会变成硬错误 | `src/application/use-cases/AskConfirm.ts:312` | 已登记为显式留债（到期 2026-10-16）；建议另立需求做 1 行条件展开 + 用例 |
| D-2 | TaskAdopt / Knowledge / Regenerate 三工具在契约测试里**没有响应源映射** ⇒ 门禁读不到它们的返回键 | `tests/output-contract.test.ts` 的 `RESPONSE_SOURCES` | 补映射即可纳入检查（属"门禁没看见"类隐患） |
| D-3 | 历史台账里旧 `text` 键的解锁评论仍不可见 | 台账历史数据 | 需数据迁移或读侧回退（新决策），本需求明确不做 |

## 7. 执行方式偏差

| 项 | 计划 | 实际 | 影响 |
|---|---|---|---|
| 落库任务 DAG | 计划文档 §2 写明依赖与批次 | 提交计划时漏带 `depends_on` ⇒ 5 张父卡 `dependsOn` 均为空 | 无功能影响（按计划顺序人工执行：t1 → t2/t4 → t3 → t5）；看板 DAG 不体现批次，已声明 |

## 8. 复核意见

- 实现与设计一致，无"设计说 A、代码做 B"。
- 修复面克制：只动回执形状与一个写入键名，未触碰 dive 状态机语义、schema 与客户端。
- 唯一需要人裁决的是第 5 节的端到端未验证项与第 6 节的 D-1（是否本轮纳入修复）。
