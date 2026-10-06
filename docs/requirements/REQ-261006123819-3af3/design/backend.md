# 后端设计（REQ-261006123819-3af3）· serves: FR-1, FR-3

> 后端面覆盖两条 FR：FR-1（工具契约登记面单点化）与 FR-3（服务端归档门读数）。
> FR-2 / FR-4 / FR-5 / FR-6 不涉及服务端运行时逻辑，见 `interfaces.md` 与 `architecture.md`。

## 服务与接口实现 <!-- serves: FR-1, FR-3 -->

### FR-1：三处登记面收敛到 `TOOL_REGISTRY` <!-- serves: FR-1,FR-3 -->

现状是**三份各自手写的清单，三个不同的数**：

| 清单 | 位置 | 断言的实际值 | 真值（本次实测） |
|---|---|---|---|
| 工具目录清单 | `tests/tools-dispatch.test.ts:26` | 18 | **27** |
| 宿主注册名单 | `tests/apply-wiring.test.ts:114` + `:159` | 26 | **27** |
| 响应源映射 | `tests/output-contract.test.ts:597` | 21 | 需 27 条登记（其中 2 条原被正则漏扫） |

改动后的取数关系（**registry 当驱动，机器事实当交叉校验**）：

```
                    src/tools/registry.ts（唯一手写面，27 条）
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  磁盘目录集合          宿主注册名集合         响应源映射
  readdirSync('src/tools')  ctx.tools[].name    entry.responseSources
        │                     │                     │
        └──── 三方必须两两相等；不等即红并点名差集 ────┘
                              │
                              ▼
        正则扫描（安全网）：扫到的工厂 ⊆ registry.key
        —— 兜住"新增了工厂但忘了登记"
```

**正则必须同时放宽**（否则安全网对带第二参数的工厂失明）：

```ts
// tests/output-contract.test.ts:672 现状
const re = /export function define(\w+)Tool\(deps: UseCaseDeps\)/g
// 改为（容许第二参数）
const re = /export function define(\w+)Tool\(deps: UseCaseDeps(?:\s*,[^)]*)?\)/g
```

### FR-3：归档门读数的状态判定 <!-- serves: FR-1,FR-3 -->

`src/application/query/QueryDocs.ts:669-690` 的 `case 'archive'` 分支改为按**需求状态**判定：

```ts
case 'archive': {
  const a = req.archive
  // ① 已归档：状态是唯一事实源（archivedAt 已删，见 D-2）
  if (req.status === 'archived') {
    const at = archivedMomentOf(req)
    out.push({
      gate: 'archive',
      verdict: 'passed',
      // ② 拿不到时刻就**整体省略** at 键——不发 undefined/null（无损 JSON 铁律）
      ...(at !== undefined ? { at } : {}),
    })
    break
  }
  // ③ 材料已备但需求还没到 archived
  if (a?.submittedAt !== undefined) {
    out.push({ gate: 'archive', verdict: 'pending', at: a.submittedAt, reason: '归档材料已提交，待归档确认' })
    break
  }
  // ④ 未提交材料（22 条无清单需求落这一支——这是与 ③ 不同的诚实状态）
  if (reached(req, 'accepting')) {
    out.push({ gate: 'archive', verdict: 'pending', reason: '尚未提交归档材料' })
    break
  }
  out.push({ gate: 'archive', verdict: 'not-reached' })
  break
}
```

**改动前 vs 改动后（同一条 `status=archived` 的真实记录）**：

| | 改动前（实测输出） | 改动后 |
|---|---|---|
| verdict | `pending` | `passed` |
| reason | `归档材料已提交，待归档确认` | 无（passed 不带 reason） |
| at | 无（`archivedAt` 恒 undefined） | `statusHistory` 里 archived 事件的真实 `at` |

实测命令与输出（审计期取证，可复跑）：

```console
$ npx tsx /tmp/gate-probe.mts
REQ-261002120707-deab status=archived archive=yes | [{"gate":"archive","verdict":"pending","at":1790918736567,"reason":"归档材料已提交，待归档确认"}]
REQ-261002115204-ba52 status=archived archive=yes | [{"gate":"archive","verdict":"pending","at":1790913701229,"reason":"归档材料已提交，待归档确认"}]
REQ-261001213924-1441 status=archived archive=yes | [{"gate":"archive","verdict":"pending","at":1790904577457,"reason":"归档材料已提交，待归档确认"}]
```

## 数据流 <!-- serves: FR-3 -->

```
台账 statusHistory（状态机写入，已有真实数据）
        │
        ▼
archivedMomentOf(req)           ← 新纯函数，唯一判定点
        │
        ▼
buildGateVerdicts(req, tasks)   ← QueryDocs.ts:566
        │  { gate:'archive', verdict:'passed', at }
        ▼
GET 需求详情端点 → DocsResponse.gates[]
        │
        ├──▶ 文档面板 gatesSection(d.gates)            （既有渲染，不变）
        └──▶ 文档面板 archiveSection(a, gate)          ← FR-3 改：用这条读数判「已归档」
```

**关键性质**：客户端**不再自己判**"是否已归档"。判据在服务端发生一次，客户端消费结果。
这正是本仓反复强调的"判据收敛为单点"（先例：`live-card-single-source`、`gate-read-root`）。

## 关键逻辑 <!-- serves: FR-1 -->

### 派生与交叉校验（`tests/output-contract.test.ts`） <!-- serves: FR-1 -->

```ts
// 驱动源：registry（不再是正则扫描）
for (const entry of TOOL_REGISTRY) {
  it(`define${entry.key}Tool：所有 return 分支键均已声明`, () => {
    const keys: string[] = [...returnKeys(readFileSync(join(ROOT, entry.factoryFile), 'utf8'))]
    for (const rel of entry.responseSources) keys.push(...returnKeys(readFileSync(join(ROOT, rel), 'utf8')))
    // 扫描器可信度自检保持原样：每个工具体至少应抓到一个键
    expect(keys.length, `define${entry.key}Tool 未扫到任何 return 键，扫描器可能失效`).toBeGreaterThan(0)
    const factory = (toolModules as Record<string, (d: unknown) => any>)['define' + entry.key + 'Tool']
    const missing = [...new Set(keys)].filter(k => !declaredKeys(factory({} as never)).has(k))
    expect(missing).toEqual([])
  })
}

// 安全网：正则扫到的工厂必须都在 registry 里（挡住"新增工厂忘登记"）
it('正则扫到的工厂全部已登记（未登记即红并点名）', () => {
  const scanned = scanFactories()                       // 放宽后的正则
  const known = new Set(TOOL_REGISTRY.map(e => e.key))
  expect(scanned.filter(k => !known.has(k))).toEqual([])
})

// 反向自检：每个 registry 条目的工厂文件必须真的导出该工厂
it('registry 逐条可构造（工厂文件存在且导出该工厂）', () => {
  for (const e of TOOL_REGISTRY) {
    expect(typeof (toolModules as any)['define' + e.key + 'Tool']).toBe('function')
  }
})
```

### FR-1 的**两步实施规则（必须遵守，防范围失控）** <!-- serves: FR-1 -->

放宽覆盖会让 `Bind` / `Handoff` 第一次真正接受契约门禁——它们此前**完全无覆盖**，
因此可能暴露既有声明漂移。处置规则：

1. **第一步**：补齐 4 条缺映射 + 建立 registry + 三处派生 → 跑门禁，应全绿。此时**不动**正则。
2. **第二步**：放宽正则 + 把 `Bind` / `Handoff` 纳入 registry → 复跑。
   - 若全绿：完成。
   - 若报出未声明键：**先确认是不是"纯声明对齐"**——
     - 是纯声明对齐（真实返回形状合理，只是 schema 漏写）⇒ 就地补 `output.schema.properties`。
     - 若暴露出**真实行为/契约问题**（返回形状本身该改）⇒ **不在本需求改**，
       登记为已知缺口并说明"留待独立需求"，同时把该条登记进测试文件的既有"已知留债登记表"机制
       （`tests/output-contract.test.ts:97` 起有现成先例），**不许为了让测试变绿而删断言**。
3. 近似比对预告（非门禁判据，仅供实施者预期）：`Handoff` 的 `windowKey` 疑似未在
   `output.schema` 声明；`Bind` 未发现明显缺口。**这是近似结论，以第二步实测为准。**

## 错误处理 <!-- serves: FR-1, FR-3 -->

| 场景 | 行为 | 依据 |
|---|---|---|
| registry 条目指向不存在的文件 | 测试红并打印路径（`readFileSync` 抛错被断言包裹） | 快速失败优于静默跳过 |
| 工厂构造抛错 | `declaredKeys(factory({}))` 抛错 ⇒ 该条用例红 | 工厂必须是纯构造、不依赖运行时 deps（现状 27 个工厂都满足） |
| `archivedMomentOf` 拿不到时刻 | 门禁读数**省略 `at` 键**，仍判 `passed` | 绑定层无损 JSON 铁律：值为 undefined 的属性会被整体拒收（`ClearPause.ts:9` 自述的规则） |
| 需求既无 `archive` 又没到 accepting | 门禁 `not-reached`（沿用现状） | 不改既有语义 |

## 数据库设计 <!-- serves: FR-3 -->

**无持久化变更、无迁移、无回滚数据脚本。**

- 删除的 `archivedAt` / `archivedBy` 是**可空**字段，且真实数据中 0 条被写入 ⇒ 不存在"旧数据需要处理"的情况。
- 台账侧无 schema 版本变更（`schemaVersion` 不动）。
- 回滚 = `git revert` 该提交；因为字段从未被写入，回滚后行为与现在一致（回滚安全）。

## 性能考量 <!-- serves: FR-3 -->

- `archivedMomentOf` 是对 `statusHistory` 的一次线性扫描（≤ 十数量级条目），
  调用点 `buildGateVerdicts` 每次详情请求执行一次 —— 可忽略。
- **不引入新的 IO**：`statusHistory` 已在 `RequirementRecord` 上（服务端装配时已读）。
- 客户端**零新增请求**：复用载荷里已有的 `gates`。

## 安全设计 <!-- serves: FR-1 -->

- 无新增外部输入面；registry 是编译期常量，不接受运行时输入。
- **不新增任何"放行开关"**：本次所有判据都是收紧或等价（FR-3 让门禁从不正确的 `pending`
  变为正确的 `passed`/`pending`，不新增"跳过"路径）。
- FR-1 的派生不软化门禁：清单从手写改为派生后，"新增工具会被看到"这一性质**更强**
  （现状两个工具完全不可见）。

## 关键决策与取舍 <!-- serves: FR-1, FR-3 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| registry 驱动还是正则驱动 | 保留正则驱动，只把清单数字改对 | registry 驱动 + 正则当安全网 | 只改数字的话，下一个带第二参数的工厂会再次静默失明（本次就是这么坏的两个） |
| 放宽正则的范围 | 一步到位（补映射 + 放宽 + 纳入 bind/handoff） | **两步走**，第二步带明确处置规则 | 放宽会让两个从未受检的工具首次受检，可能带出既有漂移；两步走让"哪一步出的问题"可界定 |
| 归档门 `at` 缺值时 | 用 `archive.submittedAt` 顶替 | 整体省略 `at` 键 | 顶替就是把"材料提交时刻"谎报成"归档时刻"——本需求要消灭的正是这类谎报 |
| 暴露出的既有契约漂移 | 为了让本需求收绿，删断言或加豁免 | 纯声明对齐就地修；真实契约问题登记为已知缺口另立 | 门禁红着正好说明它开始工作了；删断言会把审计结论变成摆设 |

## 技术方案与亮点 <!-- serves: FR-1, FR-3 -->

- **把"登记表"搬进被登记者的目录**：`src/tools/registry.ts` 与 27 个工具目录同层，
  加工具的人在自己目录里就能看到要填什么；而不是去 700 行的 `tests/output-contract.test.ts` 里找 map。
- **交叉校验三方机器事实**：registry 是唯一手写面，但它同时被"磁盘目录 / 宿主注册名 / 工厂导出"
  三方校验 —— 手写面越少、校验面越多，漂移就越难藏。
- **用真实数据验证判据**：FR-3 的谓词在写进设计前已对 87 条真实归档记录跑过（100% 可取值），
  而不是等实施完再发现"有的记录取不到"。
