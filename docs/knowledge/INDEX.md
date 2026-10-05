# 项目知识索引

> DSH 的「项目看板」双半插件：host 侧四层（domain/application/adapters/tools+http）跑需求流水线
> （立项 → 需求 → 设计 → 拆分 → 实施 → 验收 → 归档），client 侧是自包含看板视图；本目录是它的知识层。

## 架构

- kb-architecture-layers · architecture · 四层职责与依赖方向 · → architecture.md#layers

## 规范

- kb-conventions-c01 · standard · 层边界只许向内 · → conventions.md#c-01
- kb-conventions-c02 · standard · 宿主单文件不超过 400 行 · → conventions.md#c-02
- kb-conventions-c03 · standard · 注入预算不裁保底 · → conventions.md#c-03
- kb-conventions-c04 · standard · 客户端构建纪律 · → conventions.md#c-04
- kb-conventions-c05 · standard · 样式表必须自带归属章 · → conventions.md#c-05
- kb-conventions-c06 · standard · 产物闸门不可绕过 · → conventions.md#c-06
- kb-conventions-c07 · standard · 条款与章节必须被接收 · → conventions.md#c-07
- kb-conventions-c08 · standard · 验收标准必须可执行 · → conventions.md#c-08
- kb-conventions-c09 · standard · 知识层自检 · → conventions.md#c-09
- kb-conventions-c10 · standard · 生成物不可手改 · → conventions.md#c-10
- kb-conventions-c-11 · standard · 发版前必须构建（host + client） · → conventions.md#c-11
- kb-conventions-c-12 · standard · 改了客户端源码必须重建 bundle · → conventions.md#c-12
- kb-conventions-c-13 · standard · 改了知识层内容必须重生成并自检 · → conventions.md#c-13
- kb-conventions-c-14 · standard · 提交前必须跑测试并与基线比对 · → conventions.md#c-14
- kb-conventions-c-15 · standard · 改了源码必须跑类型检查 · → conventions.md#c-15
- kb-conventions-c-16 · standard · 改了提示词片段必须重生成产物 · → conventions.md#c-16
- kb-conventions-c-17 · standard · 重生成后必须校验片段与产物一致 · → conventions.md#c-17
- kb-conventions-c-18 · standard · 发版前必须同步镜像仓库 · → conventions.md#c-18
- kb-conventions-c-19 · standard · 新增 stageKind 必须完成登记点全表 · → conventions.md#c-19
- kb-conventions-c-20 · standard · 工程操作：npx tsx scripts/reverse-drill-matrix.mts · → conventions.md#c-20
- kb-conventions-c-21 · standard · 工程操作：npx tsx scripts/reconcile-terminal-drill.mts · → conventions.md#c-21

## 前端令牌

<!-- kb:generated:begin -->
- kb-tokens-colors · tokens · 颜色表与变量入口 · → design-tokens.md#colors
<!-- kb:generated:end -->

## 决策

（暂无）
- kb-0001 · decision · PM 插件工具可视化增强：会话内卡片带 📋 徽标/状态流转/下一步指引/错误分类提示，提示词注入带 PM 前缀，60 测试全过。 · → entries/kb-0001.md
- kb-0002 · decision · 实施链队列调度重新设计：凭证门修复（lastReport 替代 lastRun）+ 并行调度（selectAdvanceBatch）+ 并行执行（AdvanceChain batch），修复 REQ-260929184406-2084 卡死链。 · → entries/kb-0002.md
- kb-0005 · decision · 验收单自证失败修复：验收单只收顶层父卡（parentId 投影为真双保险）、系统项编号连续无空洞、需求级项标题单点可区分、验收锚点失效可见化；并解除两处阻断（4 个缺失源码模块复原、插件装载层 cordis.patch.yml 重建）与一处语法损坏，使验收单本身重新成为可信裁决依 · → entries/kb-0005.md
- kb-0008 · decision · 唤醒链的两处装配接缝（diveRoundPorts.delivery 与投递器 idFactory）任一处断掉都是静默停摆；disarm 是事实终态，用 disarmed+active 判别误停摆并恢复，idle/paused 永不覆盖。 · → entries/kb-0008.md
- kb-0009 · decision · 读盘类闸门改为按被核验需求自己的 workspaceRoot 读盘（唯一收敛入口 + 7 处接线）：消除「文件在盘上却报不存在」的误拦，同时止住拆分内容硬门/FR 覆盖门/需求文档格式门在错根下静默放行；含 E2E 正反双向用例与防旁路静态断言。 · → entries/kb-0009.md
- kb-0010 · decision · 唤醒链不再会「静默停摆」：人的意图（activation）与运行时健康（driverHealth）分家，一次异常不再等于永久失去自动化；达上限/故障都只是「停下等人」且恢复时归还本阶段额度；回合计数改本阶段语义；新增心跳兜底与 [WAKE-RX] 接收证明；存量台账启动幂等迁移。 · → entries/kb-0010.md
- kb-0011 · decision · 长文本工具入参写法约定：把「怎么写才不踩 JSON 转义坑」收敛为一处共享常量 LONG_TEXT_ARG_NOTE（三锚点：短句 ≤60 字 / 需引号用「」/ 超长拆多次调用）+ 覆盖清单 LONG_TEXT_FIELDS（15 条 / 8 工具），各工具 descripti · → entries/kb-0011.md
- kb-0013 · decision · 会话头部需求流程图：挂在右侧工具组最左（utilities, order -20），按标题行宽度四档降级（1000/780/600，单一源 FLOW_TIERS），详情面板与会话框左边对齐；回归门=探针 + 契约单测 + 端到端用例。 · → entries/kb-0013.md
- kb-0014 · decision · 看板窗口/会话 chip 指向已归档会话时，点击改为先取消归档恢复该会话、再打开它；恢复失败或客户端不具备该能力时给明确原因并指路，不再只弹「无法跳转」。 · → entries/kb-0014.md
- kb-0016 · decision · 计划落库的条款引用（refs）收敛为「一处取数（refsForLanding）、一道门禁（FR 覆盖）、一处写入（建卡 + AmendTaskRefs）」：三条入口落出的卡与引用一致，卡级无落点只点名不拒批，存量空引用可用回填器 dry-run/apply/check/resto · → entries/kb-0016.md
- kb-0018 · decision · 需求台账由单册 JSON 改为分片目录并完成存储端口化：首屏载荷降到五千四百一十六字节（原为二百七十六万八千九百六十字节），产物扫描移出读接口，三个实现同跑一份端口契约全绿。 · → entries/kb-0018.md
- kb-0019 · decision · 迁移门拒绝启动不再静默：宿主三相启动 + 只回 503 的降级路由 + 代入真实路径的可复制迁移命令；客户端不再丢弃非 2xx 响应体，看板从「HTTP 404」变为「为什么 + 怎么修」。实施中另修两处真缺陷：任务读取入口绕过工作区根收敛点（重载后任务全部不可见）、子卡凭证把一 · → entries/kb-0019.md
- kb-0024 · decision · 模型选择器点开即消失：本机把 checkout 构建的 ui-primitives 覆盖进官方 app.asar 导致界面混装崩溃；交付三步取证法与可重放脚本，本仓零运行时代码改动 · → entries/kb-0024.md
- kb-0026 · decision · 子卡阶段模板补齐四段（e2e/manual/release/capture）+ template 一等字段：默认链不再盖不住端到端/人工核对/发布/采集；manual 段成为全链唯一「落清单骨架后停链等人」的断点（防伪造锚 manualSkeletonAt、不写健康位），加段的  · → entries/kb-0026.md
- kb-0027 · decision · 看板/需求详情深链 404 修复：宿主补 /dashboard exact 兼容入口（200 中转页保留片段）+ 客户端消费片段切面板定位 + board-focus 订阅通道覆盖「已挂载/不可见」两种顺序；board_link 契约一字未改，只同步工具文案。 · → entries/kb-0027.md
- kb-0028 · decision · 席位授权落地：一条需求从「一个独占窗口」变成「一个 owner + 若干席位的窗口」，agent 可自行开窗（DSH 会话分支）并把窗口派成 worker/observer；授权判定从窗口绑定改为席位，owner 独占推阶段与人工门，存量 52 条零改写。 · → entries/kb-0028.md
- kb-0033 · decision · 开新窗口续作：落点/交接/投递三件事各自的失败都表现为「新窗口干不了活」——落点优先 workspace、owner 交接一次原子写（席位↔绑定同指一窗）、判据三档且读数缺席不猜。 · → entries/kb-0033.md
- kb-0035 · decision · 写入侧收口：产物只在需求自己的项目里落盘——写盘前核验根、错配即拒（两个绝对路径）、判定下沉到 8 个文档写入器与 2 个队列收口包装，并以静态门禁防止改造后再漏；读侧（897b）与写侧合起来，「一条需求一个项目」在读写两面都成立。 · → entries/kb-0035.md
- kb-0037 · decision · 知识层不再要人管：插件在项目根确定时自动补齐缺失的知识层（已有层零读零写、手写永不覆盖），知识库页与侧栏入口随之删除（人直接读 INDEX.md），生成规则单点化到领域纯函数 + 应用用例（CLI 退化为薄包装）。 · → entries/kb-0037.md
- kb-0038 · decision · 归档清单改为提交时对账：未列文件必须显式处置（收进清单或声明不收并写理由），否则拒绝提交且零台账改动；豁免规则常量单点（工具重建物），并新增强制写理由的受控补录（只追加 + 留痕，不碰产物与状态），对账结果进台账与看板。 · → entries/kb-0038.md
- kb-0040 · decision · 看板需求详情页恢复可用：/state 只发摘要后，详情改为进入时按需取全文（GET /requirements/:id），配在途去重 + 方向性失效 + 加载/未找到/失败三态 + 缺字段防御；首屏仍是 0 次详情请求。 · → entries/kb-0040.md
- kb-0041 · decision · 看板运行态指示落地：看板泳道卡与列表行直接复用 DSH 客户端已有的会话运行态（byId[].running，实时推送），显示「绑定窗口正在跑回合」的转圈并自动增隐；判据与 host seatsOf 同源，拿不到读数时不显示也不伪造——零 host 接口、零台账字段。 · → entries/kb-0041.md

## 坑

（暂无）
- kb-0006 · pitfall · 收尾门两处错位已修：节流不再把「关完自己的子卡再关父卡」当成滥用（兄弟卡与跨卡仍拦），子卡模板验收标准自带可跑命令；并查清「改 src 不 build 则现场照旧」的生效链。 · → entries/kb-0006.md
- kb-0007 · pitfall · 验收不再要人填结果：agent 提交材料时逐项落实际结果，弹框/看板只问裁决；无法自动验证的项才要求人填并写明理由。 · → entries/kb-0007.md
- kb-0012 · pitfall · PM 插件 agent 测评套件：调研业界方法（Langfuse 四维度/τ-bench 终态比对+pass^k/三层断言）后交付 eval-suite/——36 用例三件套（场景+台账断言+轨迹断言）、5 份评审 rubric、执行 runbook、评分表（六维加权+红线一票否 · → entries/kb-0012.md
- kb-0015 · pitfall · 重复交付归档：Dive 唤醒链「组合根 idFactory 装配错位」已由 REQ-261001201200-8f8b 交付并验收（7/7），本需求零代码改动；新增认知（重复立项的判定信号与处置口径）已并入项目说明书「唤醒链的两处装配接缝」一节。 · → entries/kb-0015.md
- kb-0020 · pitfall · 需求级回退从「改一个状态字段」升级为原子事务：回退方向让开产物门、下游确认与计划批准如实作废、旧卡取消并物化重做卡、断点与自动链按新阶段重算，两侧共用一处编排；回程上五道人工门一道未动。全量失败数与现场基线持平、构建 verify-client OK、代码回滚演练通过；附带修掉  · → entries/kb-0020.md
- kb-0021 · pitfall · reqboard_capture 弹框答案契约修复：answers 五键收敛为 CAPTURE_ANSWER_KEYS 单一事实源（类型/schema/测试三方同源），嵌套键漂移从此当场红；教训=新增弹框问项必须同步输出 schema，静态扫描只管顶层键、嵌套层靠共享常量+动态用 · → entries/kb-0021.md
- kb-0022 · pitfall · DSH 席位退役=非 chain 占用者渲染抛一次异常即被摘掉（abdicate）、控件静默变空白；三步判别=inspect 看 active/registrant、控制台取 slot entry crashed 原文、npm pack 与 app.asar 逐符号对标 · → entries/kb-0022.md
- kb-0025 · pitfall · 实施链可靠性硬化：锁续租防双跑、批内写集分组真并行（默认保守串行）、depends_on 定性修正+一致性防线+构建指纹、死代码清偿、N-1~N-3 三缺口关闭；全量 97≤98 基线零新增 · → entries/kb-0025.md
- kb-0029 · pitfall · 拆分节点从此先算容量再拆：卡片体量声明（改几个文件 / 几条验收锚点 / 多少字符，声明不得小于证据）+ 超容量软门禁（只报不拒；返回体 / 批准弹框 / 计划文档标记三通道同源可见，标记批数必须相等，门禁读实际提交路径）；余量读数只读上屏并标注「非门禁判据」，拿不到就说拿不到、 · → entries/kb-0029.md
- kb-0030 · pitfall · 会话头部流程图的 token 读数不再随窗口变窄而消失：窄档常显「需求累计 Token」（口径改走与节点同源的合计，修掉记录级总计漏进行中阶段的坑），探针新增「各档可见 token ≥ 1」硬断言。 · → entries/kb-0030.md
- kb-0032 · pitfall · 流程图每节点 token 跟名字走：节点内改上下两行（横向 358px 降到 214px），节点数阈值降到与节点名相等，有名字就有数；累计总数只在明细全隐时出现；并定稿字号主次。 · → entries/kb-0032.md
- kb-0034 · pitfall · token 读数从「执行窗口单会话」改成「本窗口加全部后代子代理会话」的血缘聚合；实测漏计 37.7% 被补齐；预算闸口径未动并在面板写明差异。 · → entries/kb-0034.md
- kb-0036 · pitfall · 回退物化的三条硬边界（只物化顶层父卡 / 物化即终态 / 幂等且上限 20 超限整次拒绝）+ 仅人批量清场入口，终结「一次回退把 17 张卡炸成 73 张且无撤销入口」。 · → entries/kb-0036.md
- kb-0039 · pitfall · 看板可改每阶段回合上限（四级来源、同步快照、改小不掐断在跑那一轮、内置默认下限 5），可把台账切到 SQLite 库（一次性票据的人工确认门、否定作答不可消费、迁移先备份再建库且失败不伤源数据），并在系统记录里留档（路径档案 / 后端使用史 / 迁移与回滚 / 版本一致性）。 · → entries/kb-0039.md

## 契约

（暂无）

## 术语

- kb-glossary-terms · glossary · 术语表 · → glossary.md#terms

## 代码地图

<!-- kb:generated:begin -->
- kb-code-map-modules · map · 模块级地图与符号检索入口 · → code-map.md#modules
<!-- kb:generated:end -->

## 待写

- 《需求流水线》：六阶段状态机与五道人工门
