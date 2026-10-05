# 测试证据 · REQ-261001110934-3766（代码知识库）

> **TL;DR**：本需求新增 **7 套用例 / 68 条**、2 个门禁脚本、1 个几何探针、1 个故障注入驱动；
> 全部命令可复跑，原始输出留档在 `evidence/`。与 HEAD 基线对比：**失败 160 → 106（零新增失败）**。

## 一、用例（`npx vitest run <file>`）

| 套件 | 条数 | 覆盖什么 | 结果 |
|---|---|---|---|
| `tests/kb-domain.test.ts` | 25 | 索引行语法 / id 双射 / 锚点切节 / 预算溢出 / 条目头 | ✅ |
| `tests/kb-repository.test.ts` | 11 | 整文件与小节读取 / 幂等追加 / 生成区边界 / 响亮失败 | ✅ |
| `tests/kb-tool-budget.test.ts` | 9 | 预算只回指针 / 参数校验 / 机器索引检索 / 工具壳契约 | ✅ |
| `tests/kb-inject-compat.test.ts` | 9 | 缺省零改动 / 索引节位置与截断 / 摘要带指针 | ✅ |
| `tests/kb-archive-deposit.test.ts` | 7 | 归档沉淀 / 幂等 / 空 index_entry 拒绝 / 未装配不阻断 | ✅ |
| `tests/kb-route.test.ts` | 6 | `GET /kb` 信封 / 预算 / 400 / 未装配 / 既有路由抽样 | ✅ |
| `tests/kb-client-page.test.ts` | 4 | 页面两端同源注册 / 文案排序 / 缺 slots 响亮失败 | ✅ |
| 既有回归：`tests/acceptance-archive.test.ts` | 12 | 归档与验收既有流程 | ✅ 零回归 |

## 二、门禁与探针（命令 + 期望）

| 命令 | 期望 | 留档 |
|---|---|---|
| `pnpm run kb:check` | 生成物零漂移 + 九项自检全过，退出码 0 | `evidence/t10-coldstart.txt` |
| `npx tsx scripts/kb-probe.mts` | K1–K9 九项；任一坏 → 退出码 1 + 指出 id/行号 | `evidence/t9-probe-fault-injection.txt` |
| `python3 evidence/probe-fault-injection.py` | 六类故障各非零退出，还原后 0 | 同上 |
| `npx tsx scripts/kb-build.mts --check` | 零漂移；手改一行 → 退出码 1 + 首个差异行 | `evidence/t2-t3-build-test-output.txt` |
| `npx tsx scripts/kb-coldstart-probe.mts` | 9 题问答包 + 读入成本 4,199 vs 40,545 字符（≈9.7×） | `evidence/t10-coldstart.txt` |
| `npx tsx scripts/knowledge-page-probe.mts` | 三档宽度 `problems=NONE` + 截图 | `evidence/kb-page.png` |
| `pnpm build:client` | `[verify-client] OK`（关键符号 / 样式归属章 / CSS 分片） | `evidence/t6-client-page.txt` |
| `python3 evidence/volume-probe.py` | 源码 / 骨架 / 文档 / 规范载量 / 令牌 / 架构 六组字符数 | `evidence/volume-probe-2026-10-01.txt` |

## 三、零回归量法（最关键的一条）

同一 `node_modules`、两个工作树各跑一次 `pnpm test`：

| 工作树 | 测试文件 | 用例 | 失败 | 通过 |
|---|---|---|---|---|
| HEAD（`188c4a5`） | 263（53 文件失败） | 2,720 | **160** | 2,540 |
| 当前（含本需求） | 282（49 文件失败） | 2,913 | **106** | 2,787 |

- 失败数**下降**、通过数上升 ⇒ **本需求零新增失败**；新增 19 个测试文件 / 193 条用例全部通过。
- 剩余 106 条为仓库既有（示例：`RandomIdFactory` 仍断言旧 `REQ-[0-9a-f]{6}` 格式，现行为 `REQ-261001130918-53b9`）。
- 原始对比留档：`evidence/full-test-comparison.txt`。

## 四、已知缺口（不隐瞒）

| 缺口 | 为什么 | 替代覆盖 |
|---|---|---|
| 真实 GUI 内点开「知识库」页的截图 | headless Chrome 无 auth token 进不去 GUI（返回 `dsh web authentication required`） | 路由与数据：`tests/kb-route.test.ts`；注册：`tests/kb-client-page.test.ts`；样式与几何：三档探针 + 截图 |
| 冷启动问答「答对 ≥4/5」的人工评分 | 评分需要人判断答案是否切题 | 已备好 9 题问答包与出处（`evidence/t10-coldstart.txt`），请在验收单上裁决 |

## 五、任务覆盖标注（covers · 门禁可解析）

- `tests/kb-domain.test.ts` — covers: t-9bd693, t-c51aba, t-b86f1d, t-6f7375
- `tests/kb-repository.test.ts` — covers: t-9c3f8a, t-5c815f, t-33082b, t-880a6d, t-7ca260
- `scripts/kb-build.mts` + `evidence/t2-t3-build-test-output.txt` — covers: t-edc290, t-292ced, t-e3fcfa, t-862bca, t-ec4ce2
- `tests/kb-tool-budget.test.ts` — covers: t-c3a7f5, t-c10475, t-4adaa1, t-d1d6b2, t-4f1d22
- `tests/kb-route.test.ts` — covers: t-ad5e60
- `tests/kb-client-page.test.ts` + `scripts/knowledge-page-probe.mts` — covers: t-fa6a9b
- `tests/kb-archive-deposit.test.ts` — covers: t-82abca, t-79d3db, t-75c4e5, t-f81b42, t-511681
- `tests/kb-inject-compat.test.ts` + `evidence/t8-inject-compat.txt` — covers: t-ecfb28, t-48d16b, t-3f7178, t-9c33d2, t-0629ee
- `scripts/kb-probe.mts` + `evidence/probe-fault-injection.py` — covers: t-371168, t-73b3cf, t-fff008, t-2497ac
- `docs/knowledge/*` + `scripts/kb-coldstart-probe.mts` + `evidence/t10-coldstart.txt` — covers: t-c6c6ae, t-3fcaa5, t-b0cded
- `scripts/kb-build.mts --backfill` + `evidence/full-test-comparison.txt` — covers: t-792566, t-a34c53, t-b44650, t-329559, t-96473c
- `package.json`(kb:check) + `README.md` + `docs/architecture/project-manual.md` — covers: t-88da59, t-109505, t-6cf8bb
