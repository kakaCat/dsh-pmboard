# 复盘（REQ-261008004324-81df）

> bug 档必交文档之一。口径：目标 vs 结果、偏差逐条解释、教训与防回归。

## 一、目标 vs 结果

| 目标（requirement.md） | 结果 | 说明 |
|---|---|---|
| 目标-1 A 类夹具跟进 | **达成** | 21 个 A 类文件全绿（25 个 A 文件里 4 个定性为真缺陷，已移出另案） |
| 目标-2 C 类环境与基线 | **部分达成** | 5 个 C 文件全绿；`pnpm kb:check` 仍 exit 1（K1/K3/K14 三条改前即红、授权外） |
| 目标-3 在飞新增红清零 | **达成** | `skills-assets` 8 passed；真实 tarball pycache/pyc 计数均为 0 |
| 目标-4 每条定性有依据 | **达成** | `qualitative-ledger.md` 37 行五列，依据列全为「命令读数 / 需求 id / 文件:行」 |
| 目标-5 基线可机械复核 | **未达成** | `--refresh` 只刷 `failures.txt` 会破坏三份清单的分诊不变量并引入 3 条新红，已按仓规回滚 |

## 二、偏差逐条解释（都不许静默）

1. **范围从 32 文件收敛到 28 文件内修**：定性查出 11 条用例是真缺陷（需改生产代码），
   按 D-1「不动生产语义」移出另案 ⇒ 这是 BUG-10 预设的机制，不是范围蔓延的反面。
2. **`pnpm kb:check` 未过**：三条门（K1 `INDEX.md` 10669 > 8000 chars、K3 `conventions.md` 223 > 200 行、
   K14 新增不可判定 kb-0064/kb-0065）**改前即红**，且要改的三份文件都不在本需求授权内。
   取证方式：HEAD 版 `INDEX.md` 已 16624 chars、`conventions.md` 与 HEAD 逐字节相同、
   `unverifiable.baseline.txt` 与 HEAD 相同。
3. **被别处先修好的一条**：取证件记的「`pnpm kb:check` 4 处生成物漂移」在开工前（01:05:11）已被
   另一窗口重生成修掉；本需求 t10 的 `--write` 是幂等空转，**不领这份功**（如实写进交付）。
4. **设计两处数字被更正**（evidence 优先，不回改已确认文档）：
   `isolate-node-context` 依赖宿主包的是 **5 条**不是 16 条（结果为 24 passed + 5 skipped）；
   §3/§4 三条的红因是 `IsolateNodeContextDeps.store` 必填未传，不是缺包。
5. **基线回滚**：`--refresh` 后 `--check` 差集非空（3 新增 / 2 不再失败），
   只读分诊报告显示 `failures=23` vs `reverse+other=68`（4 新增未分诊 + 49 消失欠收敛）。
   按仓规「刷分类文件是人的动作」`git checkout --` 回滚两文件，分诊不变量恢复、3 条新红消失。

## 三、教训与防回归（已合并进 docs/guides/red-test-triage.md）

- **红不是一种东西**：三类成因（夹具滞后 / 真缺陷 / 环境基线）修法完全不同；先分诊再动手。
- **归属用 A/B 对照**（干净 HEAD worktree），不靠猜；本次据此证明 36 文件是既有红、1 条在飞新增。
- **环境类两条硬口径**：缺依赖用显式 `skipIf`（计数可见 + 依据可读）；守护对象消失就退休并留依据。
- **基线三份清单同源**：单刷 `failures.txt` 必红；刷分类是人的动作。
- **打包门**：`pnpm pack --dry-run` 在 pnpm 10.22 不存在（假绿陷阱）；
  子目录 `.npmignore` 对 pnpm 不生效 ⇒ 持久防复发需收窄 `files`（未做，留给后续）。
- **静默放大器要点名**：`session-driver.ts:491` 注释写 warn 实为 `info`；
  `gate-prompt.ts:220-223` 零投递且零日志——这类「吞掉异常」是本次多条红难定位的根因。

## 四、留给后续的清单（另案，不属本需求）

| 项 | 类型 | 落点 |
|---|---|---|
| 三要素门零调用点（2+1 条用例） | 真缺陷 | `MoveTask` done 预检 + 人路径出口接线 |
| `doc_sync_warning` 无出口面 | 断言面缺失 | 语义搬迁裁定 |
| `CaptureGuidanceDeps.address` 死参数 | 真缺陷 | 折进 capture guidance 段或正式退役 |
| `round-state.ts:306-315` 旧相位判定 | 真缺陷 | 跟现行枚举 |
| `ExecuteTask.ts:653-656` 内联回退 | 真缺陷 | 改调 `rollbackSubtask` |
| `MoveRequirement.ts:237` 丢 `stampCheckpoint` | 真缺陷 | 补写入器调用 |
| `src/index.ts:567` 漏传 `store` | 真缺陷（本次新发现） | 补传 ⇒ 避免 NODE_ISOLATION 静默失败 |
| `kb:check` K1/K3/K14 三条门 | 授权外 | `INDEX.md` / `conventions.md` / `unverifiable.baseline.txt` |
| 基线三份清单重新分诊 | 人的动作 | `failures.txt` / `reverse.txt` / `other.txt` 同源刷新 |
| 打包防复发的 pnpm 通道 | 配置面 | 收窄 `package.json` 的 `files` |
| B 类 5 文件技术债 | 范围外（N1） | 层边界 / 消息卫生 / 尺寸门禁 / 写盘点 / 活卡单源 |

## 五、过程指标（供下次估算）

- 13 张父卡 / 62 张子卡；子卡阶段用时（`reqboard_status` 遥测）：repro 11 次共 36s、
  fix 11 次共 12s、review 13 次共 16s、regress 11 次共 9.5s、dev/test 3 次共 53s（登记簿耗时，不含 agent 思考）。
- 取证阶段 4 个只读子代理并行（6/6/7/7 文件），一次拿到逐文件根因，未返工。
- 实施阶段 11 个子代理按卡并行；1 个子代理在交付前用满 60 次请求预算（已交付完整报告，未放行）。
