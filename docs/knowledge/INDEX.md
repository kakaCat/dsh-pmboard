# 项目知识索引

> DSH 的「项目看板」双半插件：host 侧四层（domain/application/adapters/tools+http）跑需求流水线
> （立项 → 需求 → 设计 → 拆分 → 实施 → 验收 → 归档），client 侧是自包含看板视图；本目录是它的知识层。
> 索引行为**短标签**（按 id 取条目正文看完整结论）；标签只保留最能定位该条结论的子句。

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
- kb-conventions-c-22 · standard · 收录/更新上游 skill 资产必须重算指纹 · → conventions.md#c-22
- kb-conventions-c-23 · standard · 改了提示词片段必须重生成并校验（一条命令） · → conventions.md#c-23
- kb-conventions-c-24 · standard · 模板与门禁必须同源（节名与必填节） · → conventions.md#c-24
- kb-conventions-c-25 · standard · 模板探针的标本模式（人为改坏必红） · → conventions.md#c-25
- kb-conventions-c-26 · standard · 提示词注入面里的路径指针必须可达 · → conventions.md#c-26
- kb-conventions-c-27 · standard · 工程操作：pnpm prompts:verify · → conventions.md#c-27
- kb-conventions-c-28 · standard · 改动后必须提交 · → conventions.md#c-28
- kb-conventions-c-29 · standard · 提交前必须跑测试并与基线比对 · → conventions.md#c-29
- kb-conventions-c-30 · standard · 改了详情页外观必须比对逐组件快照 · → conventions.md#c-30
- kb-conventions-c-31 · standard · 组件样式只许住自己的分片 · → conventions.md#c-31
- kb-conventions-c-32 · standard · 工程操作：pnpm cost:report · → conventions.md#c-32

## 前端令牌

<!-- kb:generated:begin -->
- kb-tokens-colors · tokens · 颜色表与变量入口 · → design-tokens.md#colors
<!-- kb:generated:end -->

## 决策

（暂无）
- kb-0066 · decision · 三面文档判据加固：需求条款须有可核验判据（软提示）、设计坐标须可达且源码类落点回写模块改动地图（按需硬判）、feature/refactor 的 sides 与新需求的「失败与并发路径」节（硬门）、拆分引用单口径（只认卡上 requirement_refs）与文档所见=批准所见— · → entries/kb-0066.md
- kb-0068 · decision · 路径抽取口径扩根：PATH_RE 补 src 与 mts，让冲突门与零交集建议真正生效（可抽取率 56.6% 升到 99.6%）；代价是文件级冲突门命中 7 升到 57，两个待决问题已登记 · → entries/kb-0068.md
- kb-0069 · decision · 四条确认通道统一走「落章 + 推进 + 收尾」单点：推进与收尾各收敛到一处，看板推进与窗口在线解耦，门禁回执改指 reqboard_ask_confirm。 · → entries/kb-0069.md
- kb-0070 · decision · 拆分粒度从"凭经验"锁到接口级/组件级：设计文档交出接口清单/组件树（硬门）  拆分计划对照表逐条覆盖（硬门）  一卡多接口拒、files>5 与多锚点只警告；RTM 一对多为原生能力不改模型。 · → entries/kb-0070.md
- kb-0071 · decision · 给测试立判据：错误码口径由脚本生成（零覆盖 23   5）、红基线分诊让 refresh 再也洗不绿、测试进程由内核级沙箱拦住仓内写入；src 零改动。 · → entries/kb-0071.md
- kb-0001 · decision · PM 插件工具可视化增强：会话内卡片带 📋 徽标/状态流转/下一步指引/错误分类提示… · → entries/kb-0001.md
- kb-0002 · decision · 实施链队列调度重新设计：凭证门修复（lastReport 替代 lastRun）+ 并行调度… · → entries/kb-0002.md
- kb-0005 · decision · 验收单自证失败修复：验收单只收顶层父卡（parentId 投影为真双保险）… · → entries/kb-0005.md
- kb-0008 · decision · 唤醒链的两处装配接缝（diveRoundPorts.delivery 与投递器 idFactor… · → entries/kb-0008.md
- kb-0009 · decision · 读盘类闸门改为按被核验需求自己的 workspaceRoot 读盘… · → entries/kb-0009.md
- kb-0010 · decision · 唤醒链不再会「静默停摆」：人的意图（activation）与运行时健康… · → entries/kb-0010.md
- kb-0011 · decision · 长文本工具入参写法约定：把「怎么写才不踩 JSON 转义坑」收敛为一处共享常量 LONG_TEX… · → entries/kb-0011.md
- kb-0013 · decision · 会话头部需求流程图：挂在右侧工具组最左（utilities, order -20）… · → entries/kb-0013.md
- kb-0014 · decision · 看板窗口/会话 chip 指向已归档会话时，点击改为先取消归档恢复该会话、再打开它… · → entries/kb-0014.md
- kb-0016 · decision · 计划落库的条款引用（refs）收敛为「一处取数（refsForLanding）、一道门禁… · → entries/kb-0016.md
- kb-0018 · decision · 需求台账由单册 JSON 改为分片目录并完成存储端口化：首屏载荷降到五千四百一十六字节… · → entries/kb-0018.md
- kb-0019 · decision · 迁移门拒绝启动不再静默：宿主三相启动 + 只回 503 的降级路由 + 代入真实路径的可复制迁移… · → entries/kb-0019.md
- kb-0024 · decision · 模型选择器点开即消失：本机把 checkout 构建的 ui-primitives 覆盖进官方… · → entries/kb-0024.md
- kb-0026 · decision · 子卡阶段模板补齐四段（e2e/manual/release/capture… · → entries/kb-0026.md
- kb-0027 · decision · 看板/需求详情深链 404 修复：宿主补 /dashboard exact 兼容入口… · → entries/kb-0027.md
- kb-0028 · decision · 席位授权落地：一条需求从「一个独占窗口」变成「一个 owner + 若干席位的窗口」… · → entries/kb-0028.md
- kb-0033 · decision · 开新窗口续作：落点/交接/投递三件事各自的失败都表现为「新窗口干不了活」——落点优先 works… · → entries/kb-0033.md
- kb-0035 · decision · 写入侧收口：产物只在需求自己的项目里落盘——写盘前核验根、错配即拒（两个绝对路径）… · → entries/kb-0035.md
- kb-0037 · decision · 知识层不再要人管：插件在项目根确定时自动补齐缺失的知识层（已有层零读零写、手写永不覆盖）… · → entries/kb-0037.md
- kb-0038 · decision · 归档清单改为提交时对账：未列文件必须显式处置（收进清单或声明不收并写理由）… · → entries/kb-0038.md
- kb-0040 · decision · 看板需求详情页恢复可用：/state 只发摘要后，详情改为进入时按需取全文… · → entries/kb-0040.md
- kb-0041 · decision · 看板运行态指示落地：看板泳道卡与列表行直接复用 DSH 客户端已有的会话运行态… · → entries/kb-0041.md
- kb-0042 · decision · 需求详情页从「按数据来源堆 Tab 的证据面」重构为「按读者六个问题组织的工作汇报」… · → entries/kb-0042.md
- kb-0043 · decision · 插件包自带 7 份 UI/UX skill 资产（含可检索主 skill）；子代理读不到包内路径，故由 reqboard_skill_install 投放到会话工作区并回执绝对路径；需求分析节点只注入一小节「原型工作原则」（可裁、只进重档）。 · → entries/kb-0043.md
- kb-0044 · decision · 需求分析节点新增一小节「原型工作原则」：要做原型就派子代理… · → entries/kb-0044.md
- kb-0045 · decision · 写盘根判定重定：写入的根由「这条需求记录自己声明的 workspaceRoot」决定… · → entries/kb-0045.md
- kb-0046 · decision · 回退后重新批准计划的静默丢卡（REQ-261005122915-9f90）… · → entries/kb-0046.md
- kb-0047 · decision · 详情页文档存在性判定改按需求自身工作区（命中哪个根就给哪个根的绝对路径）… · → entries/kb-0047.md
- kb-0048 · decision · 把「是不是同一个项目」从路径比较换成项目 id 相等（session/projectId/workspaceRoot）；看板、扫描、知识层自举与子代理根一律按项目身份定位，跨项目派席与交接当场拒绝。 · → entries/kb-0048.md
- kb-0049 · decision · 项目归属改按项目 id 判定：看板、扫描、知识层与子代理根一律按项目定位… · → entries/kb-0049.md
- kb-0050 · decision · 开窗继承：三个开窗入口造出的新窗口会写标题（沿用 GUI 的「源标题 (1)」递增口径… · → entries/kb-0050.md
- kb-0051 · decision · 挂起确认的拦截面有了判据：只拦「有确认门且有在册产物」的票，无门/无产物一律放行（读时谓词… · → entries/kb-0051.md
- kb-0052 · decision · 需求详情页外观层收口：浅色岛令牌 + 六档字阶 + 24px 命中区 + 可见焦点环 + 灰度可… · → entries/kb-0052.md
- kb-0054 · decision · 看板运行圈的「在跑」判据扩为「绑定窗口在跑回合 ∪ 新鲜推进锁」… · → entries/kb-0054.md
- kb-0055 · decision · 确认门两条路径共用推进单点 applyConfirmedAdvance… · → entries/kb-0055.md
- kb-0056 · decision · 原型豁免（prototype_exempt）的消费点补齐… · → entries/kb-0056.md
- kb-0057 · decision · 验收项由 agent 在提交验收材料时逐项实测落章，人只做零输入裁决… · → entries/kb-0057.md
- kb-0058 · decision · 桌面端控制台「插件包地址 404 / plugins/events ERR_FAILED」= 重… · → entries/kb-0058.md
- kb-0059 · decision · 判定面整治：工具登记面单点化 + 基线改集合差口径 + 归档门按状态判 + 知识层自检 12 项全过 + C-28 提交判据与证据指纹 · → entries/kb-0059.md
- kb-0060 · decision · 同一道人工确认门从此至多一个在途框（建门唯一入口 + 复用优先），台账首写即事实（五处落章写点共用首写纪律）——迟到或被取代的作答只留痕，不再覆写审批时间与证据原文。 · → entries/kb-0060.md
- kb-0063 · decision · 工具清单从四处手写收敛为一处事实源（registry.ts 27 条）：README 工具表 27 行六组、四处计数校准到 27、装配日志改为从 TOOL_REGISTRY 派生，并配两条守卫用例（8 用例）与三条故障注入；零工具行为变更。 · → entries/kb-0063.md

## 坑

（暂无）
- kb-0072 · pitfall · reqboard 插件工具面体检：主流程健康，3 个高危边界 bug（H1 人工门否定路径、H2 HTTP 绕门、H3 跨进程无锁），27 工具可精简至 21/19，136 错误码待注册表化；待裁决是否立项整治 · → entries/kb-0072.md
- kb-0006 · pitfall · 收尾门两处错位已修：节流不再把「关完自己的子卡再关父卡」当成滥用（兄弟卡与跨卡仍拦）… · → entries/kb-0006.md
- kb-0007 · pitfall · 验收不再要人填结果：agent 提交材料时逐项落实际结果，弹框/看板只问裁决… · → entries/kb-0007.md
- kb-0012 · pitfall · PM 插件 agent 测评套件：调研业界方法（Langfuse 四维度/τ-bench 终态比… · → entries/kb-0012.md
- kb-0015 · pitfall · 重复交付归档：Dive 唤醒链「组合根 idFactory 装配错位」已由 REQ-261001… · → entries/kb-0015.md
- kb-0020 · pitfall · 需求级回退从「改一个状态字段」升级为原子事务：回退方向让开产物门、下游确认与计划批准如实作废… · → entries/kb-0020.md
- kb-0021 · pitfall · reqboard_capture 弹框答案契约修复… · → entries/kb-0021.md
- kb-0022 · pitfall · DSH 席位退役=非 chain 占用者渲染抛一次异常即被摘掉（abdicate）… · → entries/kb-0022.md
- kb-0025 · pitfall · 实施链可靠性硬化：锁续租防双跑、批内写集分组真并行（默认保守串行）… · → entries/kb-0025.md
- kb-0029 · pitfall · 拆分节点从此先算容量再拆：卡片体量声明（改几个文件 / 几条验收锚点 / 多少字符… · → entries/kb-0029.md
- kb-0030 · pitfall · 会话头部流程图的 token 读数不再随窗口变窄而消失：窄档常显「需求累计 Token」… · → entries/kb-0030.md
- kb-0032 · pitfall · 流程图每节点 token 跟名字走：节点内改上下两行（横向 358px 降到 214px）… · → entries/kb-0032.md
- kb-0034 · pitfall · token 读数从「执行窗口单会话」改成「本窗口加全部后代子代理会话」的血缘聚合… · → entries/kb-0034.md
- kb-0036 · pitfall · 回退物化的三条硬边界（只物化顶层父卡 / 物化即终态 / 幂等且上限 20 超限整次拒绝… · → entries/kb-0036.md
- kb-0039 · pitfall · 看板可改每阶段回合上限（四级来源、同步快照、改小不掐断在跑那一轮、内置默认下限 5）… · → entries/kb-0039.md
- kb-0053 · pitfall · 已取消的卡退出视图与统计：判据收敛为单点（live* 家族），层号现算、覆盖度分母剔卡… · → entries/kb-0053.md
- kb-0061 · pitfall · 确认作答后先清位再推进、并让「清位」本身成为一次驱动请求：修复人工门确认后 agent 静默停摆（含过期在途自动恢复与放弃留痕）。 · → entries/kb-0061.md
- kb-0062 · pitfall · 看板卡面门读数改由服务端算、客户端只渲染：修掉「四门恒红 + 产物 0/6 + 确认入口全死」，机制落 docs/architecture/project-manual.md · → entries/kb-0062.md
- kb-0064 · pitfall · 原型门补两问：非骨架判据（占位标记 + 与模板行重合率 > 0.90）与几何量证据校验（截图 + sha256）挂在锚点门；对照项由可选改硬判据并改读 INDEX 权威行；对齐判据参数化为通用判据。实测：9 条需求的权威原型曾是 0.957 与模板重合的空骨架且 100% 通过锚 · → entries/kb-0064.md
- kb-0065 · pitfall · 验收判据的三层加固：计划期拒「命令操作数仍是占位符」并在子卡落库唯一构造点按声明式闭集回填；裁决期三类项分开判（普通项无锚点记未复核 / 人工项禁收无事实短句 / 系统缺口项处置须命中两义模板）；覆盖 agent 实测原文成为原子四元组（缺理由即拒且台账零改动）；处置无效真的不放 · → entries/kb-0065.md

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
