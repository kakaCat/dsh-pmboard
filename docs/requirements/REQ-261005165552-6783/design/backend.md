---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
sides: [backend]
---

# 后端设计（REQ-261005165552-6783）

<!-- serves: FR-1, FR-2, FR-3, FR-4 -->

> 本需求是**纯宿主接线层改动**：一个字段 + 两个测试面。没有新服务、没有新端点、没有新数据表。

## 服务与接口实现 `serves: FR-1, FR-4`

**改动点（唯一）**：`src/gate-wiring.ts` 的 `registerCaptureGuidance()` 内段注册调用。

改动前（现状）：

```
spCtx.systemPrompt.section({
  name: deps.sectionName,          // 'reqboard:capture'
  order: deps.sectionOrder,        // 60
  text: (assembleContext) => { … },
})
```

改动后：

```
spCtx.systemPrompt.section({
  name: deps.sectionName,
  order: deps.sectionOrder,
  // 本段是自撰文案 + 原文引用（用户消息节选、在制任务的说明/验收、需求标题），
  // 从不使用宿主变量体系（全仓无 systemPrompt.variable 注册）。
  // 不声明它，宿主会当模板扫描 {{name}}：名字非法/未注册即抛错 ⇒ 整轮失败。
  interpolate: false,
  text: (assembleContext) => { … },
})
```

**为什么放在段上而不是段内**：插值是**宿主在段级**做的判定（`section.interpolate === false ? text : interpolate(...)`），
段内无处可拦；且段内自检只能"发现风险"，不能"消除风险"。

### 接线回归的两处断言 `serves: FR-4`

`tests/apply-wiring.test.ts`（桩 ctx 采集 sections）新增：

| 断言 | 语义 |
|---|---|
| `sections.find(name === 'reqboard:capture')?.interpolate === false` | 本段显式声明字面量 |
| 全部 `sections` 的 `typeof interpolate === 'boolean'` | 本插件注册的每段都显式声明（缺省即红） |

## 数据流 `serves: FR-1, FR-2`

```
插件 apply()
  └─ registerCaptureGuidance() ──▶ systemPrompt.section({ name, order, interpolate:false, text })
                                        │
每回合（宿主）                            │
  renderPrompt(assembly)                  │
    └─ section.interpolate === false ─────┘
         └─ text(ctx) 求值 ──▶ 原样拼接 ──▶ system prompt（不再扫描 {{…}}）

段内产能（本次一字未改）：
  text(ctx)
    ├─ windowKey 缺失 → ''
    ├─ 已绑定 + 有待捕获消息 → capturePromptForMessage(windowKey, 用户消息)      ← 外来原文①
    ├─ 已绑定 + 无待捕获    → '' → 兜底 boundSectionTextFrom(…)
    │                              ├─ 需求标题（台账字段）                      ← 外来原文②
    │                              └─ 在制任务 description/context/acceptance  ← 外来原文③
    └─ 未绑定              → captureGuidanceText(纯字面量)
```

## 关键逻辑 `serves: FR-2`

### S-1 段注册改动（`registerCaptureGuidance` 的 section 调用） `serves: FR-1`

- **标的**：`src/gate-wiring.ts` 内 `spCtx.systemPrompt.section({…})`；
- **改动**：新增 `interpolate: false` 一个字段 + 注释（为什么这段是字面量）；
- **不变**：`name`（`reqboard:capture`）、`order`（60）、`text`（函数式回调）三项逐字相同。

### S-2 接线回归断言（`tests/apply-wiring.test.ts`） `serves: FR-1, FR-4`

- 桩 ctx 采集 `sections`，断言 `reqboard:capture` 的 `interpolate === false`；
- 断言本插件注册的**每个** section 的 `interpolate` 都是布尔值（显式声明纪律）。

### S-3 反例测试判据（`tests/capture-literal-section.test.ts`） `serves: FR-2`

`tests/capture-literal-section.test.ts` 内实现一份**只读参考契约**的判据（对齐宿主 `renderPrompt` 语义，
口径见 `design/interfaces.md` 的"宿主插值器的错误语义"表）：

```
function hostLikeRender(section, variables = {}) {
  if (section.interpolate === false) return section.text      // 关键分支：与宿主同形
  // 扫描完整 {{name}} 组：名字不匹配 /^[a-z][a-z0-9_]*$/ ⇒ 抛 malformed；
  //                    名字合法但不在 variables ⇒ 抛 unknown
}
```

三个反例（任务字段 / 用户消息 / 需求标题）各跑两态：

```
expect(() => hostLikeRender({ ...sec, interpolate: true })).toThrow(/malformed prompt variable reference/)  // 证伪半
expect(hostLikeRender({ ...sec, interpolate: false })).toBe(text)                                          // 保真半
expect(text).toContain(PLACEHOLDER)                                                                        // 文本未被改写
```

**为什么自己写判据而不是 import 宿主**：宿主内部渲染函数不进测试面（asar 内私有）；
复刻判据 + 把它写进设计文档，能让"测试在断言什么"对下一个人仍然可读。判据本身的正确性由**现场台账**
（`interruption.reason` 的报错文本与判据同形）反证。

### S-4 产物重建与解冻证据 `serves: FR-3`

- `pnpm build` 重建 `dist/index.mjs`；
- 落一份命令级证据（`notes/build-evidence.md`）：`pnpm typecheck` / `pnpm build` / `pnpm test` 的退出码与产物指纹；
- 运行时解冻（重载 + 被卡窗口跑一轮）由本窗口在验收阶段复核并留档。

### S-5 边界不变量 `serves: FR-1`

- 段名 / 序位 / text 都是函数——三项与改动前**逐字相同**，避免触发宿主"段名重复"与排序契约变化；
- 段文本**逐字节不变**（既有三份测试文件即守卫，本次不改它们）。

## 错误处理 `serves: FR-1, FR-2`

| 场景 | 改前 | 改后 |
|---|---|---|
| 段文本含大写占位符（如模板里的全大写变量） | 宿主抛 `malformed prompt variable reference` ⇒ 整轮失败 | 无异常，文本原样进提示词 |
| 段文本含合法小写占位符 | 宿主抛 `unknown prompt variable`（本插件未注册任何变量） | 无异常 |
| 段文本有 `{{` 但没有 `}}` | 宿主当普通散文（不抛） | 同左（行为不变） |
| 段回调自身抛错（如投影不可用） | 已有兜底（`peekFacts` 失败 → 空集求值 + 诊断日志） | 不变 |

**失败要响亮（本仓铁律）在此处如何自处**：本需求**不是**把"响亮失败"改安静——宿主那段抛错原本是给
**模板写错的人**看的；本插件把**外来原文**当模板喂进去才是错的。修的是"喂错"，不是"别喊"。

## 数据库设计 `serves: FR-1`

**无变更**：不改表、不改 schema、不改索引、不写迁移。台账与任务队列结构不动（与 `design/data-model.md` 一致）。

### 新增/修改表 `serves: FR-1`

无。

## 性能考量 `serves: FR-1`

- 段装配多一次布尔判断，量级可忽略；**反而更省**：不再对整段文本做 `{{…}}` 扫描（省掉每回合的字符串遍历）。
- 无新增 I/O、无新增网络调用、无新增定时器。

## 安全设计 `serves: FR-1`

### 鉴权 `serves: FR-1`

不涉及（提示词装配是进程内行为，无外部入口）。

### 输入校验 `serves: FR-1`

本需求的**反直觉点**：这里**不做**输入校验——段文本里的花括号不再是"输入"，关掉插值后它就是普通字符。
给外来原文加"花括号白名单/黑名单"式校验，等于把用户原话当攻击面，既无收益又会误伤正当引用。

### 敏感信息 `serves: FR-1`

无新增：段文本本来就进提示词（本地），本次不改变任何字段的可达范围。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3`

| 取舍点 | 否掉的方案 | 选了 | 为什么 |
|---|---|---|---|
| 拦在哪 | 段回调内 try/catch 包住宿主？——做不到，抛错发生在宿主渲染期，段外 | 段级声明 | 唯一能拦住的位置就是声明 |
| 测试判据 | 依赖宿主导出 | 测试内复刻 + 文档写明参考契约 | 不失真且解耦 |
| 解冻 | 手工改数据 + 重启 | 重建产物 + 重载 | 任务缓存在进程内，热修不省事 |

## 技术方案与亮点 `serves: FR-1, FR-2`

- **一行字段消一整类故障**：把"文本里的花括号"从**结构性风险**降为**普通字符**。
- **可证伪的测试**：先证明旧语义下必抛，再证明新语义下字节级保真——避免恒真断言。
- **对使用者零感知**：不改工具、不改端点、不改文案；唯一的可见变化是"窗口不再卡死"。
