---
doc: design/architecture
req: REQ-261007223647-da5d
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 架构设计（REQ-261007223647-da5d · 轻档）

## 目标 · serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

代码层一句话：弹框类工具全部走「票先登记 + 限时等待（askTimed）+ 超时不丢票」，
立项弹框按宿主推荐契约产出 4 问内容，看板首屏渲染 pending 票，open-doc 根解析带诊断。
可证伪：`pnpm vitest run` 全绿 + AC-1~AC-6（requirement.md）逐条过。

## 分层改动图 · serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

```
 宿主（不改）          插件 adapters          application 用例/查询          client
 ─────────────       ─────────────────      ─────────────────────        ─────────────────
 userQuestions  ◀──   UserQuestionsAdapter   CaptureRequirement          board PendingConfirmBand
  ·askTimed           ·+askTimed 透传        AskConfirm / Submit 自动门   conversation-progress
  ·projection         GateAwareQuestions     gate-request（+redispatch）  open-doc（+根诊断）
 (ask_user_question   （不动：零业务语义）    capture-mapping（重写）      req-doc-location
  卡片/steer/倒计时)                          capture-interactions（新）   （+根来源红字）
```

边界守护：host 状态机/台账结构/API 不动（B2）；改动全在插件侧四层。

## A-1 限时等待取代裸阻塞 · serves: FR-1

宿主原生 `askTimed(request, callId, timeoutMs)`：窗口内作答 → 返回答案；到期 → 返回 **pending 结果**
（非错误，含无 Client 认领场景），卡片仍可答。适配器新增 `askTimed` 透传；
`timeoutMs = min(配置宽限, 工具预算 − 2s)`——等待永远死在工具预算之前，pc-a3d0aa 类事故结构性消除。
AskConfirm 阻塞路径、Submit 自动门、Capture 两段弹框全部改走它。

## A-2 票不丢 + 重投 · serves: FR-1, FR-5

PendingConfirmRegistry（内存，TTL 30min）维持现状；超时分支登记/保留 ticket 并回执 `pending+ticket`。
`requestGate` 的 reused 分支增 `redispatch` 语义：同 ticket 重发弹框通知（不新建门、不续期、不写台账）；
看板「重投弹框」按钮经 HTTP 路由调同一入口。迟到作答走宿主 steer → 人看到的卡片由宿主自管；
插件侧作答通道 = 弹框正常返回 + 看板 board-confirm（已有）。

## A-3 立项弹框内容装配 · serves: FR-3, FR-4

`capture-mapping.ts` 重写：CAPTURE_QUESTION_IDS 5→4（name/category/difficulty/location，workspace 并入 location）；
推荐项 = options[0] 且 label 带 `（推荐）` 后缀（宿主预选契约，D-9）；✖️ 固定末位且文案写收益；
新增「⚡ 全部按推荐值立项」选项 → 用例短路后 3 问并记 defaults_used；
difficulty 选项按算力档位重写；location 选项给拼好的绝对路径预览。
映射层先剥 `（推荐）` 后缀再做严格相等校验（防静默回落默认）。

## A-4 取消留痕与引导 · serves: FR-2

新 state 文件 `capture-interactions.json`（ring buffer，{windowKey, kind: reject|cancel|timeout, at}）：
ask 抛「用户未作答」→ 记 cancel；选 ✖️ → 记 reject（现行逻辑迁入，作答到达即写）。
notCreated 回执统一带替代路径文案（文字路径 + 看板路径）；同窗口 30min 内 cancel ≥ 3
→ 回执主动提议走看板且不再弹框（与拒绝粘滞同机制、同文件判定）。

## A-5 pending 票上板 · serves: FR-5

服务端：board `/state` 载荷增 `pending_confirms[]`（ticket/requirement_id/target/kind/created_at/
interrupted；remaining_ms 由 client 按 created_at+TTL 本地推导，不落库）。
client：新 `PendingConfirmBand` 钉看板首屏顶部（有票才渲染），行 = 倒计时 + 去作答 + 重投。
现状：QueryReport 黄条缺口（buildGaps ④）保留不动，两处数据源同一个读端口。

## A-6 open-doc 根诊断 · serves: FR-6

`absolutizeDocPath` 三级根（需求级 → 会话 → 服务端）每级命中记录 rootSource
（req-root/session-root/server-root/none）；`docLocationHtml` 在 rootSource ≠ req-root 时
渲染红字「地址可能不准（根来源：X）」——不静默显示可疑地址。
conversation-progress 面板独立于看板缓存取根：fetchDocLocation 已走 /requirements/:id
（req 级 workspaceRoot），保持为**首选链**；缓存缺失时宁可相对路径也不拼可疑绝对路径（现行③不变）。

## 风险与残余 · serves: FR-1, FR-6

- R1（FR-1）：harness abort（非超时）打断 capture 时，✖️ 留痕仍可能丢——缓解 = A-1 缩短等待窗口
  + A-4 连续取消计数引导；宿主 projection 对账（读 settled 答案补落章）列为后续候选，本期不接（轻档边界）。
- R2（FR-6）：用户现场的 ./dsh 错地址精确根因需复现确认（三级根都有嫌疑）——A-6 的诊断面
  让下一现场直接可读，不再盲猜。
- R3（FR-3）：宿主选项不支持富样式，原型 #FR-3 的色块仅表达意图，交付形态 = 纯文本 + 宿主推荐标记（D-9③）。

## 迁移与兼容 · serves: FR-2, FR-3

- `capture-rejections.json` 旧文件由新 interactions 适配器**读取兼容**（kind 缺省 = reject），不迁移不删；
- CAPTURE_ANSWER_KEYS 变更（workspace→location）→ CaptureTool output schema 生成式同步（FR-3 历史教训：三处同源），tests/capture-output-contract 键集断言同步改；
- 弹框 label 后缀对旧答案兼容：无后缀答案映射行为逐字不变（剥后缀是幂等的）。
