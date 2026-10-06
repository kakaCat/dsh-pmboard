# 验收证据（REQ-261005200052-ce40）

> 口径：每条结论都附**可复跑命令 + 真实输出摘要**；数字取自本机 2026-10-05 的实际跑批。
> 复跑方式：按下面的命令原样执行即可复现。

## 1. 判据命令与输出

```bash
npx vitest run tests/prototype-registration-no-pin.test.ts
```
```
 ✓ tests/prototype-registration-no-pin.test.ts  (2 tests) 2431ms
      Tests  2 passed (2)
```
（真实时序：真 fs + 真工具壳登记原型 → 等 2.4 秒 → 读挂起票；断言已翻转为「无票且可写」。）

```bash
npx vitest run tests/pending-guard.test.ts tests/pending-guard-integration.test.ts \
               tests/ask-confirm-pending.test.ts tests/submit-prototype.test.ts \
               tests/status-pending-confirm.test.ts
```
```
 ✓ tests/pending-guard.test.ts              (20 tests)
 ✓ tests/pending-guard-integration.test.ts   (8 tests)
 ✓ tests/status-pending-confirm.test.ts      (4 tests)
 ✓ tests/submit-prototype.test.ts           (20 tests)
 ✓ tests/ask-confirm-pending.test.ts        (13 tests)
      Tests  65 passed (65)
```

```bash
npx tsc --noEmit -p tsconfig.json
```
```
exit=0 行数=       0
```

```bash
npx tsx scripts/req-doc-validate.mts --req REQ-261005200052-ce40
```
```
文档自检汇总：判据 9 项（实判 6 / 读数未知 3）；缺口 0；exit 0
```

```bash
pnpm test
```
```
 Test Files  37 failed | 448 passed | 3 skipped (488)
      Tests  68 failed | 5610 passed | 22 skipped (5700)
```

**失败数口径（如实）**：本工作树同时含**其他需求的未提交改动**，拿不到「改动前」的干净基线。
故用**两次全量跑的集合差**证明零新增：上一轮 70 failed → 本轮 68 failed，**run2 相对 run1 无任何新增**，
消失的两条正是本需求修掉的两条（`status-pending-confirm` 的 plan 票 fixture、`output-contract` 的
`ask_confirm fallback=board` 用例）。其余 68 条逐类核对与本需求四条表面无交集：
REQ id 格式漂移（`REQ-[0-9a-f]{6}` 期望 vs 时间戳式 id）、缺 `@deepseek-ai/dsh-session` 依赖、
他工具缺 `RESPONSE_SOURCES`、对他处重构的源码文本断言（如 `landPlanTasks(`）、
`task_status` 多出 `run` 键等。

## 2. 逆验证（改坏实现必须真红，跑完逐字节还原）

| # | 把实现改坏成 | 必红条数 | 还原校验 |
|---|---|---|---|
| N1 | 谓词④「有门？」恒 `true`（无门票也拦） | 1 | md5 一致 |
| N2 | 谓词④ 恒 `false`（真门也放行） | 3 | md5 一致 |
| N3 | 谓词⑤「有产物？」恒 `false`（真门票被误放行） | 5 | md5 一致 |
| N4 | 文案固定三条出路（不看门、不看产物） | 3 | md5 一致 |
| N5 | 登记通知无条件输出「确认入口」 | 1 | md5 一致 |
| N6 | 删掉确认调用前的「可落章」前移校验 | 2 | md5 一致 |

## 3. 需求级判据对照（FR-1~FR-6）

| 条款 | 判据 | 结论 |
|---|---|---|
| FR-1 原型登记不产生挂起票 | 转正用例：`auto_confirm={triggered:false,…}`、2.4 秒后无票、写路径放行 | 过 |
| FR-2 守卫只拦「有门且有产物」 | pending-guard 20 例：无门放行 / 无产物放行 / 真门仍拦 / 产物出现恢复拦截 / plan 两态 | 过 |
| FR-3 文案只列真实出路 | 4 例文案断言：prototype 票与无产物票不含「看板点确认」；真门票含看板出路与失效时刻；归档需求不列「重新发起」 | 过 |
| FR-4 通知不谎报确认入口 | `artifactNotifyText(kind=prototype)` 不含「一键确认」、含「无需人工确认」 | 过 |
| FR-5 不造答不了的票 | 2 例：无产物 / 无计划均在登记票之前拒，票表保持为空 | 过 |
| FR-6 口径锁与回归 | 单一 facts 单点 4 处消费（grep 已核）+ 全量差集零新增 | 过 |

## 4. 改既有用例的说明（不是放宽）

| 文件 | 改了什么 | 为什么 |
|---|---|---|
| `tests/status-pending-confirm.test.ts` | 为「plan 票」用例补一份台账计划（新增 `seedPlan`） | FR-2 之后「无计划的 plan 票」属于答不了的空票、会被放行；该用例要投影的是**可作答**的中止票 |
| `tests/output-contract.test.ts` | 无（实现侧调整：前移校验排在「弹框通道不可用 → fallback=board」之后） | 保留既有 fallback 契约；FR-5 的「登记票之前」依然满足 |
| `tests/pending-guard-integration.test.ts` | 两处固定文案常量 + 一处精确断言改为「前缀精确 + 后缀同源计算」 | 可用出路后缀含**墙钟失效时刻**，精确常量无法稳定；前缀契约仍逐字锁死 |

## 5. 边界（本轮不做）

- 未给 agent 新增「作废挂起票」入口；真门（G1 需求 / G2 设计 / G3 计划 / G4 验收）拦截面逐字未变。
- 未改 TTL 与过期基准；未改台账 schema；未做存量迁移（守卫是读时谓词）。
- 不改客户端渲染（`src/client/**` 零改动），故未跑 client 构建（C-12 不适用）。
