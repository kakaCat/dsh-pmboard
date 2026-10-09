# 拆分计划（REQ-261007223647-da5d · 轻档）

> 目标：让弹框「超时不丢票、内容说人话、pending 看得见」——6 条 FR 落成 14 张任务卡。
> 做法：契约定死先行（弹框题目/映射、askTimed 通道、看板载荷、根诊断），实现卡依赖契约卡；
> UI 卡按组件树叶子拆；最后一张总验收卡跑全量口径。不动 host 状态机与台账结构（B2）。

## 改动盘点（对照设计文档）

| 设计文档 | 改动文件（新增/修改） | 接收卡 |
|---|---|---|
| interfaces IF-1 | src/application/internal/capture-mapping.ts（重写题目构造） | t1 |
| interfaces IF-2 | 同上（映射 + 剥后缀）+ tests/capture-output-contract | t2 |
| interfaces IF-3 | src/application/ports.ts、src/adapters/UserQuestionsAdapter.ts | t3 |
| interfaces IF-4 | src/application/internal/gate-request.ts、use-cases/AskConfirm.ts、use-cases/CaptureRequirement.ts、tools/SubmitTool/SubmitTool.ts、src/http/路由 | t4 |
| interfaces IF-6 | src/adapters/CaptureRejectionFile.ts（泛化）、application/internal/capture-rejections.ts、use-cases/CaptureRequirement.ts | t5 |
| interfaces IF-5 | application/query/QueryState.ts（或 board /state 同源投影） | t6 |
| architecture A-3 / FR-4 | tools/CaptureTool/prompt.ts、tools/CreateTool/prompt.ts、application/internal/capture-section.ts、volatile-notice.ts、SubmitTool prompt | t7 |
| frontend 组件树 | src/client 新 PendingConfirmBand/PendingTicketRow、styles/report/band.ts、board-mount.ts、api.ts | t8/t9/t10 |
| interfaces IF-7 | src/client/open-doc.ts、req-doc-location.ts、styles/files.ts | t11/t12 |
| data-model 兼容矩阵 | tests/（兼容用例） | t13 |

## 任务表

| 计划 key | 标题 | 阶段 | 侧 | 依赖 | 原型锚点 | 关联 D-x | 验收 | 工作量 |
|---|---|---|---|---|---|---|---|---|
| t1 | 立项弹框四问内容定稿 | implement | backend | — | — | D-6, D-8, D-9 | vitest 相关文件绿；断言：首项 label 带（推荐）后缀且 = titleOptions[0]、✖️ 居末、问项数 4、题干含理由 | 小 |
| t2 | 弹框答案映射防静默回落 | implement | backend | t1 | — | D-9 | vitest 绿：带后缀 selected 剥后缀后类型/难度不回落默认；location 三态拆分取值断言；答案键集 4 键契约断言 | 小 |
| t3 | 弹框通道限时等待 askTimed | implement | backend | — | — | D-1, D-9 | vitest 绿：fake svc 超时 → {kind:'pending'} 不抛；answered 原样返回；越界 → REQBOARD_INVALID_INPUT | 小 |
| t4 | 确认票超时不丢与一键重投 | implement | backend | t3 | — | D-1, D-3 | vitest 绿：AskConfirm 宽限到期回执 pending+ticket 且票活；redispatch 不新建门（registry 计数不变）；repost 跨窗口 → REQBOARD_UNKNOWN_TICKET | 中 |
| t5 | 取消留痕与连续取消引导 | implement | backend | t2, t4 | — | D-3 | vitest 绿：cancel×3/30min → 不弹框且回执含「看板」；旧 capture-rejections.json 合并读后拒绝粘滞仍命中 | 中 |
| t6 | 看板 pending 票数据投影 | implement | backend | — | — | D-1 | vitest 绿：/state 有票 → 载荷 6 键齐；无票 → []；remaining_ms 推导公式断言 | 小 |
| t7 | 弹框与工具文案口径归零 | implement | backend | t1 | — | D-4 | `grep -rn "三问\|四问" src/tools src/application` 命中 0；submit prompt 含 prototype；output-contract 测试绿 | 小 |
| t8 | pending 票行组件 | ui | frontend | t6 | prototypes/detail.html#FR-5 | D-1 | vitest 渲染断言：行内倒计时与「去作答/重投」两按钮选择器在场；`pnpm build:client` 输出 [verify-client] OK | 小 |
| t9 | pending 票首屏横带组件 | ui | frontend | t8 | prototypes/detail.html#FR-5 | D-1 | vitest 渲染断言：有票 → Band+逐行铺开；无票 → 零渲染（不占首屏）；超时票切「已超时」态 | 小 |
| t10 | 看板 pending 票接线 | ui | frontend | t9 | prototypes/detail.html#FR-5 | D-1 | `pnpm build:client` OK；/state 消费后 Band 数据属性断言（老服务端无键按 [] 渲染不报错） | 小 |
| t12 | open-doc 根解析诊断 | ui | frontend | — | prototypes/detail.html#FR-6 | D-5, D-9 | vitest 绿：缓存缺失/串会话/正常三场景 rootSource 取值断言；reqRoots 命中时绝不串根 | 小 |
| t11 | 文档位置根来源红字徽章 | ui | frontend | t12 | prototypes/detail.html#FR-6 | D-5 | vitest 断言：rootSource ≠ req-root → 红字「地址可能不准」出现；= req-root → 不出现 | 小 |
| t13 | 旧数据与旧端兼容验证 | test | fullstack | t2, t5, t6, t12 | — | D-1 | vitest 兼容矩阵全绿：旧 rejections 合并读、无（推荐）后缀答案映射幂等、老服务端无 pending 键 → client 按 [] | 小 |
| t14 | 全量验收口径收口 | test | fullstack | t4, t5, t7, t10, t11, t13 | — | D-1 | `pnpm vitest run` 退出码 0 且无新红（C-14）；`pnpm tsc --noEmit` 0（C-15）；`pnpm build` 0 且双产物更新（C-11/C-12） | 小 |

## 接口清单 ↔ 接收卡 key

| 接口 id | 职责 | 接收卡 key |
|---|---|---|
| IF-1 | 立项弹框题目构造（4 问/推荐后缀/✖️ 末位/一键过） | t1 |
| IF-2 | 答案映射（剥后缀/location 拆分） | t2 |
| IF-3 | askTimed 限时等待通道 | t3 |
| IF-4 | 确认票 redispatch 重投 | t4 |
| IF-5 | 看板 /state pending 载荷 | t6 |
| IF-6 | capture-interactions 留痕读写 | t5 |
| IF-7 | open-doc 根诊断 | t12 |

## 组件树 ↔ 接收卡 key

| 组件（叶子） | 接收卡 key |
|---|---|
| PendingTicketRow（含 TicketTitle/TicketCountdown/TicketAnswerBtn/TicketRepostBtn 四个内部叶子） | t8 |
| PendingConfirmBand（容器） | t9 |
| 看板页接线（board-mount 组装，页面唯一接线卡） | t10 |
| RootSourceBadge（DocLocationLine 内） | t11 |

## 依赖理由（零文件交集边）

- t7←t1：问数口径事实源由 t1 定稿（4 问），文案对齐以其为准，无共享文件但语义强依赖；
- t8←t6：看板载荷字段由服务端投影卡定死，UI 按字段渲染，无共享文件但契约依赖；
- t13←t2/t5/t6/t12：兼容验证针对各卡产物的旧形态，测试文件与实现文件不相交但验证对象依赖；
- t14←全部实现卡：收口卡跑全量验证命令，必须在全部实现卡完成之后。

## 容量核算

容量 16 DU/卡（detailUnits = files + anchors×0.5 + chars/2000）；全部 14 卡均 ≤ 9 DU，无超容量卡（明细见各卡 footprint）。
