# 判别力自证：六条接线，停用即红（REQ-261005141830-7a3b · t9）

> 面向：验收人 / 后续维护者。
> 为什么要这份：**用例全绿不等于用例有用**——若把判据停用后用例照样绿，那条用例就是空过的。
> 下表每一行都**现场停用 → 看到对应用例变红 → 恢复 → 看到转绿**，命令与红/绿摘要逐条记在下面。
> 恢复一律**逐字节校验**（`diff` 与停用前的备份一致）；本工作区堆着多窗口未提交改动，
> `git checkout / stash / restore` 一律是破坏性操作，故全部用「备份 → 反向编辑 → 还原」的手法。

## 汇总

| # | 停用什么 | 期望变红 | 实测变红 | 恢复 |
|---|---|---|---|---|
| a | `rootOfRequirement` 的 `projectId` 分支（改回只读记录自带路径） | T-13、E-02 | T-13 **2 条**、E-02 **1 条** | ✅ 逐字节一致 |
| b | `sameProjectOf` 的 id 优先分支 | T-03、T-04 | T-03 **2 条**、T-04 **1 条** | ✅ 逐字节一致 |
| c | 按 `projectId` 筛（看板 / 存储同一处） | T-10、E-01 | T-10 **1 条**、E-01 **1 条** | ✅ 逐字节一致 |
| d | Dive 的归属比较 | T-17 | T-17 **1 条** | ✅ 逐字节一致 |
| d2 | Dive「起轮按绑定窗口」（改成按项目找 = 把 `projectId` 当窗口用） | E-03 | E-03 **1 条**（投递数 2 ≠ 1） | ✅ 逐字节一致 |
| e | 派席 / 改绑的项目校验 | T-18、E-04 | T-18 **2 条** + T-19 **1 条**、E-04 **1 条** | ✅ 逐字节一致 |
| f | 立项写 `projectId` | T-08 | T-08 **1 条** + T-12 **1 条** | ✅ 逐字节一致 |

> 与 `design/test-cases.md` 的对应：a/b/c/d/e/f 即该表六行；其中 **d2 是 e 之外额外补的一条**——
> 设计表把 E-03 挂在「Dive 归属比较」下，但 E-03 真正钉住的是**「归属项目级 ≠ 起轮窗口级」**，
> 故把那条判别也单独停用证明了一次（结论：拿 `projectId` 当窗口用，同项目两窗口立刻重复起轮）。

## 逐条证据

### a. `rootOfRequirement` 的 `projectId` 分支

停用方式（`src/application/internal/support.ts`）：把
`const projectId = typeof record?.projectId === 'string' ? record.projectId.trim() : ''` 强制为 `''`。

```
npx vitest run tests/project-identity.test.ts -t T-13   # 停用 → Tests  2 failed | 3 passed
npx vitest run tests/project-identity.e2e.test.ts -t E-02 # 停用 → Tests  1 failed | 5 skipped
# 恢复后
npx vitest run tests/project-identity.test.ts -t T-13   # → Tests  5 passed
npx vitest run tests/project-identity.e2e.test.ts -t E-02 # → Tests  1 passed
```

**含义**：取根一旦不看项目身份，E-02（写入期间邻居改走共享根）与 T-13（身份带根、记录旧路径不作数）立刻失真——
这两条真的在验「根由身份带出」。

### b. `sameProjectOf` 的 id 优先分支

停用方式（`src/application/internal/project-identity.ts`）：把 `if (isNonEmpty(idA) && isNonEmpty(idB))` 改成 `if (false)`。

```
npx vitest run tests/project-identity.test.ts -t T-03   # 停用 → Tests  2 failed | 47 skipped
npx vitest run tests/project-identity.test.ts -t T-04   # 停用 → Tests  1 failed | 48 skipped
# 恢复后 T-03 → 2 passed；T-04 → 1 passed
```

**含义**：软链 / 尾斜杠写法归一（T-03）与「不同 id、路径同形」（T-04）两条都靠 id 优先分支成立。

### c. 按 `projectId` 筛（看板与存储同一处）

停用方式（`tests/application/harness.ts`）：删掉 `filter.projectId` 的过滤分支。

```
npx vitest run tests/project-identity.test.ts -t T-10        # 停用 → Tests  1 failed | 5 passed
npx vitest run tests/project-identity.e2e.test.ts -t E-01     # 停用 → 断言 x 只看到 P1 失败：
#   expected [ 'REQ-261005000001-aaaa', …(1) ] to deeply equal [ 'REQ-261005000001-aaaa' ]
# 恢复后 T-10 → 6 passed；E-01 → 3 passed
```

**含义**：看板「各看各的」不是界面过滤，而是查询层按项目真筛；**停掉筛子，z 就能看到 P1 的需求**。

### d. Dive 的归属比较

停用方式（`src/application/dive/round-driver.ts`）：把
`if (windowProjectId !== undefined && reqProjectId !== undefined)` 改成 `if (false)`。

```
npx vitest run tests/project-identity.test.ts -t T-17   # 停用 → Tests  1 failed | 3 passed
#   变红的那条：需求属 w-1、窗口被解析成 w-2 → 零投递 + 留痕
# 恢复后 T-17 → 4 passed
```

**含义**：归属比较停用后，跨项目的窗口会照常拿到需求并投递——T-17 的「零投递 + 留痕」正是这条防线。

### d2. Dive「起轮按绑定窗口」（把 `projectId` 当窗口用的反面）

停用方式（`src/application/dive/round-driver.ts`）：把取需求从
`r.sourceSessionId === id`（**窗口级**）改成 `r.projectId === projectIdOfWindow(id)`（**项目级**）。

```
npx vitest run tests/project-identity.e2e.test.ts -t E-03
#   停用 → 同项目多窗口不得重复起轮（归属是项目级、起轮是窗口级）: expected 2 to be 1
# 恢复后 E-03 → 1 passed
```

**含义**：这是本需求**最容易踩的那条规则**的判别例——归属可以放宽到项目级，**起轮不行**。
一旦拿 `projectId` 当窗口用，同项目的第二个窗口就会再投一轮（实测投递数 2）。

### e. 派席 / 改绑的项目校验

停用方式：`src/application/use-cases/BindSeat.ts` 的派席守卫改成 `undefined`；
`src/http/routers/requirements.ts` 的改绑守卫改成 `if (false)`。

```
npx vitest run tests/project-identity.test.ts -t T-18   # 停用 → Tests  3 failed | 3 passed
#   T-18 两条（跨项目被拒 / 台账零改动）+ T-19 一条（判据字段缺失）
npx vitest run tests/project-identity.e2e.test.ts -t E-04 # 停用 → Tests  1 failed | 5 skipped
# 恢复后 T-18 → 6 passed；E-04 → 1 passed
```

**含义**：跨项目派席/改绑真的被拦，而不是「拦了但没人验」；停掉守卫，P2 的窗口立刻能拿到 P1 需求的席位/绑定。

### f. 立项写 `projectId`

停用方式（`src/application/internal/support.ts`）：把建档时
`...(input.projectId !== undefined && input.projectId.length > 0 ? { projectId: input.projectId } : {})`
改成 `...({})`。

```
npx vitest run tests/project-identity.test.ts -t T-08   # 停用 → Tests  2 failed | 6 passed
#   T-08 入口级一条（回执与台账都读不到身份）+ T-12 一条（同项目三条互不影响的前提缺失）
# 恢复后 T-08 → 8 passed
```

**含义**：记录一出生就带身份这条链路真的在用；停掉它，后续所有按项目的判定都失去依据。
（注：`E-01` 的夹具是**直接播种**身份的，故它与 f 无关——E-01 的判别力由 c 提供，如实记在此。）

## 复跑方式

```bash
# 七条判别点各自的期望红项
npx vitest run tests/project-identity.test.ts -t T-03
npx vitest run tests/project-identity.test.ts -t T-04
npx vitest run tests/project-identity.test.ts -t T-08
npx vitest run tests/project-identity.test.ts -t T-10
npx vitest run tests/project-identity.test.ts -t T-13
npx vitest run tests/project-identity.test.ts -t T-17
npx vitest run tests/project-identity.test.ts -t T-18
npx vitest run tests/project-identity.e2e.test.ts    # E-01~E-04
```
