# 测试策略与用例（REQ-261007095750-9f48）<!-- serves: FR-1, FR-2, FR-3, FR-4 -->

> 本需求的风险不在"改不对"，而在**改了却仍然判不着**（上一需求的教训：单测全绿、真实数据 81% 空转）。
> 故本文的用例分两层：**口径边界用例**（改对了没）+ **真实数据读数**（真的判着了吗）。

## 1. 判据来源与读法 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 术语 | 读法 |
|---|---|
| **口径** | `PATH_RE` 的根与扩展名集合（`design/interfaces.md` §1.1 是唯一出处） |
| **抽得出** | `declaredFiles(文本).length > 0` |
| **判得着** | 该落点参与判据计算：冲突门能比对、零交集建议能判定（口径含它 = 判得着） |
| **真实读数** | 在 `docs/requirements/*/decomposition.md` 样本上的比例与命中数（不是单测计数） |
| 硬 / 软 | 冲突门 = 硬（拒绝）；零交集建议 = 软（`dependency_warnings`） |

## 2. 测试策略（层级 / 范围 / 载体） <!-- serves: FR-1, FR-2 -->

| 层级 | 覆盖什么 | 载体 |
|---|---|---|
| 单元（纯函数） | 抽取口径的边界：`src` 命中、`.mts` 命中、目录名不命中、去重、既有四根不回归 | `tests/<抽取口径用例>.test.ts`（实施时新建，命名 `path-extraction-scope`） |
| 集成（判据 + 端口） | 冲突门对 `src` 落点的拒绝；零交集建议对 `src` 落点的命中 | `tests/concurrency-limits.test.ts`、`tests/plan-depends-e2e.test.ts` |
| 真实数据（只读） | 扩根前后的可抽取比例、零交集命中数、冲突门命中数 | 仓库外命令（§4），读数落证据文件 |
| 文档一致性 | 领域篇的「已知边界」表不再把本条列为"未修" | `grep` 断言（§3 TC-6） |

## 3. 用例总表 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 用例 | 服务 | 覆盖 | 命令 / 输入 | 期望 |
|---|---|---|---|---|
| TC-1 | FR-1 | `src` 根 | `declaredFiles('改 src/application/internal/conflict-check.ts')` | 返回 `['src/application/internal/conflict-check.ts']`（扩根前 `[]`） |
| TC-2 | FR-1 | `.mts` 扩展名 | `declaredFiles('加 scripts/<新探针>.mts')` | 命中该路径（扩根前 `[]`） |
| TC-3 | FR-1 | 反例：目录名 | `declaredFiles('见 src/application/internal/ 这一层')` | `[]` |
| TC-4 | FR-1 | 反例：无扩展名 / 空输入 | `declaredFiles('')`、`declaredFiles('改一下 src')` | `[]`（不误报） |
| TC-5 | FR-1 | 不回归 | 既有四根样例（`packages/`、`scripts/`、`tests/`、`docs/`）+ `agent-dh/` 前缀 | 与改前逐条相同 |
| TC-6 | FR-2 | 冲突门（硬） | 两卡 `implementation` 各写同一个 `src/.../a.ts`、`dependsOn` 互不包含 | `findWorkSurfaceConflicts` 返回 1 条（扩根前 0 条）；提交被拒 `REQBOARD_FILE_CONFLICT` |
| TC-7 | FR-2 | 零交集建议（软） | 两卡分别声明 `src/.../a.ts` / `src/.../b.ts` 且无依赖、无理由 | 出现 1 条 `dependency_warnings`（扩根前为空） |
| TC-8 | FR-3 | 真实读数 | §4 的命令在样本上跑改前/改后 | 两个比例 + 两个命中数，写进证据文件 |
| TC-9 | FR-4 | 文档同步 | `grep -n "src/ 盲区" docs/architecture/doc-quality-gates.md` | 不再命中"未修"表述；改为"已覆盖 + 判据入口" |

## 4. 真实数据读数口径（FR-3 的可复核证据） <!-- serves: FR-3 -->

```bash
# ① 口径自证（一行式，仓库外）
npx tsx -e "import {declaredFiles} from './src/application/internal/conflict-check.ts'; \
  console.log(JSON.stringify(declaredFiles('改 src/application/internal/conflict-check.ts')))"

# ② 样本读数（扩根前后各跑一次，样本 = 含 src/ 的任务表行）
npx tsx -e "/* 遍历 docs/requirements/*/decomposition.md 的任务表行；\ 统计 含 src/ 行数、declaredFiles 非空行数、零交集边条数、冲突门命中数 */"
```

| 要报的数 | 改前基线（上一需求评审实测） | 改后期望 |
|---|---|---|
| 含 `src/` 的任务表行 | 530 | 同（样本不变） |
| 其中抽得出路径的行 | ≈101（19%） | **≥90%**（余下应只有"没写文件路径"的行） |
| 零交集边命中数 | 几乎 0 | **可核验的正数**，且逐条能说出是哪两张卡、哪个文件 |
| 冲突门命中数 | 0 | 新命中**逐条判真伪**：真冲突 → 说明门之前是瞎的；误报 → 记进边界并说明为什么 |

**纪律**：新命中一律不许"因为难看就放宽口径"；误报必须有依据（例如同一文件被两卡以"只读引用"方式提到
——当前正则无法区分读写，这条若成立就写进边界）。

## 5. 执行顺序与规范条目 <!-- serves: FR-3 -->

1. 先跑零副作用的口径单测与集成（TC-1…TC-7）：`npx vitest run tests/<抽取口径用例>.test.ts tests/concurrency-limits.test.ts tests/plan-depends-e2e.test.ts`
2. 再跑真实数据只读复测（TC-8），把改前/改后两列读数落进证据文件。
3. 再跑规范条目（**C-14** 提交前必须跑测试并与基线比对）：`npx vitest run --reporter=json` 与
   `docs/reviews/test-baseline.failures.txt` 做集合差，逐条归因（同工作树并发窗口在制的改动不算本次引入）。
4. **C-15** 改了源码必须跑类型检查：`npx tsc --noEmit -p tsconfig.json` → 本需求改动文件 0 错。
5. **C-11** 发版前必须构建：`pnpm build` → 退出码 0，`dist/` 与 `lib/client.js` 都有新产物（本需求不改客户端，但同一次构建一并核）。
6. 文档断言 TC-9 + `npx tsx scripts/req-doc-validate.mts --req REQ-261007095750-9f48` 缺口 0。

## 6. 不在本需求范围 <!-- serves: FR-1 -->

- **不做存量回溯**：不回改历史计划的 `depends_on`；只对新提交生效（读数照报）。
- **不改冲突门语义**：不引入"同目录即冲突"，不加读写区分（若 §4 出现该误报，只登记边界）。
- **不做设计坐标探针的扩展**：探针的问题（不判行号）是另一条已知边界，不在本次范围。
- **不改客户端**：本需求不产生界面产物（`sides: []`），故无原型对照项。
- **不新增仓库脚本**：真实数据复测用仓库外命令；退化情形见 `design/architecture.md` §3。
