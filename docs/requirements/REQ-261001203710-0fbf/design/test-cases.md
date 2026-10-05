---
serves: FR-1, FR-2
---

# 测试用例 · REQ-261001203710-0fbf <!-- serves: FR-1, FR-2 -->

> 一句话：核心是**两项目夹具 + 「零访问 / 零写入」断言**；再加一条错配必须响亮失败的反向用例。

## TL;DR <!-- serves: FR-1 -->

新增 `tests/project-scope.test.ts`。关键在于断言**「另一个项目的目录被访问/写入的次数 = 0」**——
这比断言「本项目产物存在」强得多：后者在"两个项目都写了"时也会绿。

## 两项目夹具 <!-- serves: FR-1 -->

```
dirA（项目 A 根）                     dirB（项目 B 根）
  docs/requirements/REQ-A/…             docs/requirements/REQ-B/…
        ▲                                      ▲
        └── 记录 A: workspaceRoot = dirA ───────┘  记录 B: workspaceRoot = dirB
   台账（一份，含 A 与 B 两条记录）—— 故意混装，复现"内存里没区分项目"
```

**零访问怎么断言**（三种手段，按可得性择一）：
1. **登记数不变**：以 A 为当前项目跑扫描后，断言 B 记录的 `artifacts` 数量与内容**一字不变**。
2. **文件系统快照**：扫描前后对 `dirB` 做递归清单（路径+mtime+size）比对，必须完全相同。
3. **探针计数**（最强）：给 `DocRepository` 包一层记录器，断言 `dirB` 前缀的 `exists/read/list` 调用次数为 0。

## 用例表 <!-- serves: FR-1 -->

| 用例 | 覆盖条款 | 前置 | 步骤 | 期望 |
|---|---|---|---|---|
| TC-1 零访问（扫描） | FR-1 | 台账含 A/B 两条记录，两目录各有产物 | 以 `cwd=dirA` 调用看板产物扫描 | A 的产物被扫到；**B 的目录零访问**（探针计数 0）；返回值含 `skipped ≥ 1` |
| TC-2 零写入（落库） | FR-2 | 同上，A 的计划已批准 | 对 A 落库任务卡 | `dirA/docs/requirements/REQ-A/tasks/*.md` 与 `queue.json` 存在；**`dirB` 下不出现任何新文件** |
| TC-3 错配响亮失败 | FR-2 | 人为把解析根指向 B，而记录声明 dirA | 执行会写入的操作 | 抛出 `REQBOARD_PROJECT_ROOT_MISMATCH`；文案含**两个绝对路径**；`dirB` 未被写入 |
| TC-4 立项建档落对项目 | FR-2 | 会话根 ≠ 记录的项目根 | 立项 | 建档产物（含 `rtm-lifecycle.yml`）落在记录的项目根；返回体 `usedProjectRoot === 记录根` |
| TC-5 未归属记录被标注 | FR-1 | 一条记录**无** `workspaceRoot` | 以 `cwd=dirA` 扫描 | 该记录按 dirA 处理，且返回体/评论**标注** `attributed:false`（不静默当成本项目） |
| TC-6 读侧两种病因可区分 | FR-2 | ① 项目根有索引；② 索引进错位置 | 分别调用 kb 检索 | ① 命中 ≥1 条；② 报「项目根与索引位置不一致」+ 两路径，**不得**报「未初始化」 |
| TC-7 E2E：多项目一次跑 | FR-1 / FR-2 | 两项目夹具齐备 | 一条链路：以 A 为当前项目 → 立项 → 落库 → 扫描 | 全链路只动 dirA；dirB 递归清单一字不变；台账里 A/B 各自的 `workspaceRoot` 未被改写 |

## 判别断言（为什么不能只测正向） <!-- serves: FR-2 -->

```
   只测「A 的产物在 dirA」 ──► 「两个项目都写了」也会绿  ✗
   TC-2 的「dirB 零新增」   ──► 挡住它
   TC-1 的「B 零访问」      ──► 挡住「顺带扫了别人家」
   TC-3 的「错配必拒」      ──► 挡住「干脆放弃校验、就近写」
```

## 基线口径（引 C-14 / C-15） <!-- serves: FR-2 -->

- **测试**：按 C-14，先在**当前 HEAD** 实测基线再比对（实测 `97 failed | 2880 passed`）。
  ⚠️ 规范页记录的基线（106 failed / 2807 passed）**已陈旧**；本需求按实测值比对，并把该漂移写进验收材料。
- **类型**：按 C-15，实测基线 `192` 个错误（规范页记录的 223 同样陈旧）；要求改动文件零新增错误。
- 命令：`npx vitest run tests/project-scope.test.ts` · `npx vitest run` · `npx tsc --noEmit -p tsconfig.json`。
