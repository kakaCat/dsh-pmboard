# 架构设计（REQ-261006201814-ac4f · 第二版）

> 设计产物（design 节点）。任务划分与依赖属拆分阶段，不在此出现。
> 每个二级及以上章节带 `serves:` 标注（门禁 `design_orphan`）。
> **本版是第二版**：第一版的三处机制假设经实施期实测被证伪（见 §已被证伪的机制），此处全部替换。

## 目标与总体方案 `serves: FR-1, FR-2, FR-4, FR-5, FR-10`

**问题**：本仓「测试是否真的在判」没有判据。四个具体病灶：
① 错误码口径是一句 grep，不同人得出 129 / 128 / 127 三个数；
② 口径内 127 个大写码里 25 个零断言，且**新增码不会被任何门禁发现漏配**（实施期实测：别的窗口
新增了两个真码，没有任何清单知道）；
③ 68 条失败被基线合法化，`baseline:refresh` 可以把纪律门禁一起洗绿；
④ 测试写真实工作树——污染源已定死到单点，但**第一版的拦截机制在技术上不可能成立**。

**设计方案**：全部改动落在 `tests/`（+ `vitest.config.ts`）与 `docs/reviews/`，**src 零改动**（D-3）。
五层结构：

```
   ① 口径层（唯一事实源，由脚本生成而非手抄）
   tests/helpers/error-code-scan.ts ──扫描──▶ tests/fixtures/error-code-inventory.json
        │                                      127 大写 + 23 小写 + 5 排除项
        │
   ② 触发层（数据驱动）
   tests/helpers/code-trigger-harness.ts ──▶ tests/error-code-matrix.test.ts（it.each）
        │
   ③ 豁免层（棘轮）                          ④ 分诊层（两集合不相交）
   tests/fixtures/error-code-exempt.json      docs/reviews/test-baseline.reverse.txt
   tests/error-code-exempt.test.ts            docs/reviews/test-baseline.other.txt
        │                                     tests/baseline-triage.test.ts
        │
   ⑤ 隔离层（三层，主判据是「真拦」）
   ⑤-a Node 权限模型：worker 带 --permission --allow-fs-write=<临时目录> → 仓内写入被内核拒
   ⑤-b 契约锚点：所有 docs 替身的 workspaceRoot() 必须是绝对临时根
   ⑤-c 隔离副本对拍：git worktree 内跑全量，前后逐文件哈希不变
```

**不这么做的后果**：不立口径层 ⇒ 读数不可比；不立触发层 ⇒ 零覆盖缓慢回升且无人知；
不立豁免层 ⇒ 不可触发码只能靠人记在文档里（本仓「两份真相」教训）；不立分诊层 ⇒ refresh 继续洗绿；
不立隔离层 ⇒ 本仓历史代价重演（`tool-deps.ts:56-62` 记录：一次全量跑出 44 个文件、
历史上有 8717 个测试产物被提交进仓库）。

## 已被证伪的机制 `serves: FR-5, FR-10`

**这一节是本版最重要的部分**：第一版写进设计的三个机制经实测不成立，**永久作废**，不得再写进任何设计。

| 第一版机制 | 为什么不可能 | 证据 |
|---|---|---|
| `setupFiles` 里改写 `fs` 导出以拦住仓内写入 | `node:fs` 的 ESM 命名空间**只读**（`Cannot assign to read only property 'writeFileSync'`）；且病灶 `file-io.ts:11` 用**具名导入**，改写命名空间也拦不住 | Node v25.6.1 现场实验 |
| 「改 `FakeDocs.workspaceRoot()` 一行即可」 | `ensureWritableProjectRoot` 拿声明根调 `docs.exists()`，而 `FakeDocs` 是**相对键**替身 → 绝对根必被拒 | A/B：带改动 35 失败 vs 回退 25 失败，差集 10 条全在 create/capture |
| 「跑测试前后工作树哈希不变」作判据 | 共享工作树下别的窗口随时在写：只跑一个只读测试文件 846ms，`REQ-000001` 的 6 个 rtm 仍变化 | 对照实验 |

**教训（写进 FR-10）**：机制必须**先验证再写进设计**；判据的**灵敏度**必须用 A/B 反证（单侧全绿不算证据）。

## 隔离层三层结构 `serves: FR-5`

```
   ⑤-a 真拦（主判据）        ⑤-b 契约锚点（快速回归）      ⑤-c 端到端对拍
   ─────────────────         ────────────────────         ──────────────
   Node --permission          断言「docs 替身的根          git worktree 内
   --allow-fs-write=<tmp>     必须是绝对临时根」            跑全量，前后
        │                          │                       逐文件哈希比对
        ▼                          ▼                            │
   仓内写入 →                 改回 '.' → 守卫红                 ▼
   ERR_ACCESS_DENIED                                     与共享工作树无关
   （实测有效）               （锁住已知类泄漏）
```

**三者关系**：⑤-a 是**拦得住**的那道（内核层拒绝），⑤-b 是**定位快**的那道（把成因钉在契约上），
⑤-c 是**不依赖进程内机制**的那道（跨进程/子进程写入也覆盖）。缺 ⑤-a 则拦不住，
缺 ⑤-b 则红了不知为何，缺 ⑤-c 则子进程写入无人管。

**版本差异必须处理**：Node 20 该开关名为 `--experimental-permission`；Node 25 为 `--permission`，
且**不接受**逗号分隔的 `--allow-fs-write=a,b`（须重复 flag）。设计给出探测 + 降级路径：
版本不支持时 ⑤-a 跳过并在报告里**如实标注未执行**（不得静默当成通过）。

## 回归归因判据（FR-10 的落地形状） `serves: FR-10`

任何改动**共享夹具 / 测试根 / 全局配置**的卡，验收必须附 A/B 对照：

```
   同一批测试文件
        ├── A：带本次改动    ──▶ 失败集合 A
        └── B：回退本次改动  ──▶ 失败集合 B
                                   │
              逐条比对：A − B = 本次引入的回归（必须为空）
                        B − A = 本次修好的（如实列出）
                                   │
              任一侧同一配置连跑 ≥2 次，区分「本次引入」与「既有顺序脆弱性」
```

**为什么必须这样**：t2 实测——原验收只跑 2 个文件全绿，而 A/B 立刻抓到 10 条回归；
且同一配对连跑 3×3，两侧失败数逐次相同（证明剩余差异属既有脆弱性而非本次引入）。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-10`

| 模块/文件 | 类型 | 改动内容 | serves | 影响范围 |
|---|---|---|---|---|
| `tests/helpers/error-code-scan.ts` | 新增 | 码抽取与分类的唯一实现（含常量别名与双形态覆盖） | FR-1 | 清单与矩阵共用 |
| `tests/fixtures/error-code-inventory.json` | 新增 | 冻结清单（脚本生成：127 + 23 + 5） | FR-1 | 守卫数据源 |
| `tests/error-code-inventory.test.ts` | 新增 | 口径守卫 + 假阴性自检 | FR-1 | 新增码漏配即红 |
| `tests/drill/refresh-error-code-inventory.mts` | 新增 | 自助刷新（幂等，新码记 `unclassified`） | FR-1、FR-9 | 多窗口自助路径 |
| `tests/helpers/code-trigger-harness.ts` | 新增 | 触发矩阵骨架 + 三条自检 | FR-2 | 矩阵数据源 |
| `tests/error-code-matrix.test.ts` | 新增 | 参数化「触发 → 断码」 | FR-2 | 零覆盖 25 → ≤5 |
| `tests/fixtures/error-code-exempt.json` | 新增 | 豁免白名单（逐条 reason/plan/blocker） | FR-3 | 棘轮数据源 |
| `tests/error-code-exempt.test.ts` | 新增 | 双向钉死 + 只减不增 | FR-3 | 防豁免变垃圾桶 |
| `tests/baseline-triage.test.ts` | 新增 | reverse/other 与基线三方对账 | FR-4 | 防 refresh 洗绿 |
| `docs/reviews/test-baseline.{reverse,other}.txt` + `.reverse.notes.md` | 新增 | 分诊产物与逐条红因 | FR-4 | 人读 + 机器对账 |
| `tests/setup/hermetic-guard.ts` | 新增 | 契约锚点守卫（⑤-b） | FR-5 | setupFiles 装载 |
| `vitest.config.ts` | 改 | ⑤-a 的 worker `execArgv`（权限模型）+ `setupFiles` | FR-5 | 全仓测试进程 |
| `tests/application/harness.ts` | 改 | `FakeDocs` 认绝对根（keyOf 归一 + 根自身存在） | FR-5 | 108 文件 / 278 调用点 |
| `tests/helpers/workspace-root.ts` | 新增 | 测试根唯一事实源 | FR-5 | 两套策略合一 |
| 一次性点位 4 处 | 改 | `rtm-health` / `capture-hook` / 两个 `plan-footprint` | FR-5 | 已知泄漏点 |
| `tests/helpers/ab-attribution.ts` | 新增 | A/B 归因助手（跑两组、逐条比集合） | FR-10 | 共享夹具类卡的验收工具 |
| 约 15 个既有测试文件 | 改 | 41 处 `success=false` 升级为断码 | FR-6 | 只追加不删改 |
| `tests/{authorization,concurrency,empty-input}-matrix.test.ts` | 新增 | 三类矩阵（逐格钉死 + 计数断言） | FR-7 | 洼地 14/16/3 |
| `tests/drill/reverse-drill-error-codes.mts` | 新增 | 反向演练（备份 + sha256 + 逐字节还原） | FR-8 | 证明判据真在判 |

**边界声明**：`vitest.config.ts` 与 `tests/drill/*.mts` 不在底稿列举的
「tests/ + docs/reviews + 夹具」三处内，本设计把它们算作**测试配置与夹具**并显式声明（D-11）。
不改 `package.json`（演练用 `npx tsx` 直接跑）。

## 风险与对策 `serves: FR-5, FR-9, FR-10`

| 风险 | 触发条件 | 对策 | 归属 |
|---|---|---|---|
| 权限模型在某些用例上过严 | 仍有测试合法写仓 | 逐条修点位；**不得**靠关掉 ⑤-a 了事（关掉须在报告里如实标注） | FR-5 |
| ⑤-a 在旧 Node 上不可用 | Node 20 的开关名不同 | 运行时探测；不支持则跳过并如实标注 | FR-5 |
| 守卫变「喊狼来了」 | 别的窗口加码被红但无出路 | 报红必附一条可跑的自助命令（FR-9③） | FR-9 |
| 豁免白名单被当垃圾桶 | 把难测的码全塞进 exempt | 棘轮只减不增 + reason/plan 非空 + 双向钉死 | FR-3 |
| 契约锚点误伤 | 别的窗口改写代码行 | 消息内附自助命令；锚点匹配用行原文 | FR-1 |
| A/B 被当作形式 | 只跑一次就声称「不是本次引入」 | FR-10 要求同配置连跑 ≥2 次并列集合差 | FR-10 |
| 演练脚本还原事故 | 用「按路径检出」还原会回退别人改动 | 文件级备份 + sha256 + 并发写入检测 | FR-8 |

## 不做什么 `serves: FR-9`

- **不改 `src/`**（D-3）：发现的 5 条实现缺口只上报。
- **不清零红因**（多在 src，红线内不可达）。
- **不扩测试规模**：只提升反向密度与纪律。
- **不删 `REQ-000001/2`**：只出处置结论。
- **不新增 npm script**：不碰 `package.json`。
- **不做 UI**：无原型产物。
