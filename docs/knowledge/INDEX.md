# 项目知识索引

> DSH 的「项目看板」双半插件：host 侧四层（domain/application/adapters/tools+http）跑需求流水线
> （立项 → 需求 → 设计 → 拆分 → 实施 → 验收 → 归档），client 侧是自包含看板视图；本目录是它的知识层。
> 索引行为**短标签**（按 id 取条目正文看完整结论）；标签只保留最能定位该条结论的子句。

## 架构

- kb-architecture-layers · architecture · 分层与依赖方向 #layers · → architecture.md#layers

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
- kb-conventions-c-11 · standard · 发版前必须构建（host + clien… · → conventions.md#c-11
- kb-conventions-c-12 · standard · 改了客户端源码必须重建 bundle · → conventions.md#c-12
- kb-conventions-c-13 · standard · 改了知识层内容必须重生成并自检 · → conventions.md#c-13
- kb-conventions-c-14 · standard · 提交前必须跑测试并与基线比对 · → conventions.md#c-14
- kb-conventions-c-15 · standard · 改了源码必须跑类型检查 · → conventions.md#c-15
- kb-conventions-c-16 · standard · 改了提示词片段必须重生成产物 · → conventions.md#c-16
- kb-conventions-c-17 · standard · 重生成后必须校验片段与产物一致 · → conventions.md#c-17
- kb-conventions-c-18 · standard · 发版前必须同步镜像仓库 · → conventions.md#c-18
- kb-conventions-c-19 · standard · 新增 stageKind 必须完成登记点… · → conventions.md#c-19
- kb-conventions-c-20 · standard · 工程操作：npx tsx scripts… · → conventions.md#c-20
- kb-conventions-c-21 · standard · 工程操作：npx tsx scripts… · → conventions.md#c-21
- kb-conventions-c-22 · standard · 收录/更新上游 skill 资产必须重算… · → conventions.md#c-22
- kb-conventions-c-23 · standard · 改了提示词片段必须重生成并校验（一条命令… · → conventions.md#c-23
- kb-conventions-c-24 · standard · 模板与门禁必须同源（节名与必填节） · → conventions.md#c-24
- kb-conventions-c-25 · standard · 模板探针的标本模式（人为改坏必红） · → conventions.md#c-25
- kb-conventions-c-26 · standard · 提示词注入面里的路径指针必须可达 · → conventions.md#c-26
- kb-conventions-c-27 · standard · 工程操作：pnpm prompts:ve… · → conventions.md#c-27
- kb-conventions-c-28 · standard · 改动后必须提交 · → conventions.md#c-28
- kb-conventions-c-29 · standard · 全量测试入口 · → conventions.md#c-29
- kb-conventions-c-30 · standard · 改了详情页外观必须比对逐组件快照 · → conventions.md#c-30
- kb-conventions-c-31 · standard · 组件样式只许住自己的分片 · → conventions.md#c-31
- kb-conventions-c-32 · standard · 要看 token 花在哪儿就出报表 · → conventions.md#c-32
- kb-conventions-c-33 · standard · 工程操作：pnpm boundary:c… · → conventions.md#c-33

## 前端令牌

<!-- kb:generated:begin -->
- kb-tokens-colors · tokens · 颜色表与变量入口 · → design-tokens.md#colors
<!-- kb:generated:end -->

## 决策

（暂无）
- kb-0066 · decision · 需求/设计/拆分三面文档… · → entries/kb-0066.md
- kb-0068 · decision · 拆分依赖判据的 src/… · → entries/kb-0068.md
- kb-0069 · decision · 确认通道接线收敛：四条通… · → entries/kb-0069.md
- kb-0070 · decision · 拆分粒度细化：接口级/组… · → entries/kb-0070.md
- kb-0071 · decision · 测试反向与异常覆盖补强（… · → entries/kb-0071.md
- kb-0075 · decision · reqboard 体检第… · → entries/kb-0075.md
- kb-0076 · decision · P1：弹框与确认门体验优… · → entries/kb-0076.md
- kb-0079 · decision · 测试卫生收尾：活卡单点新… · → entries/kb-0079.md
- kb-0001 · decision · PM 插件工具可视化增强… · → entries/kb-0001.md
- kb-0002 · decision · 实施链队列调度重新设计：… · → entries/kb-0002.md
- kb-0005 · decision · 修复验收单自证失败：pa… · → entries/kb-0005.md
- kb-0008 · decision · 修复节点确认后不唤醒 a… · → entries/kb-0008.md
- kb-0009 · decision · G2 完整性闸门未按需求… · → entries/kb-0009.md
- kb-0010 · decision · 修复唤醒链的订阅作用域：… · → entries/kb-0010.md
- kb-0011 · decision · 长文本工具参数写法约定：… · → entries/kb-0011.md
- kb-0013 · decision · 会话头部需求流程图改为响… · → entries/kb-0013.md
- kb-0014 · decision · 看板窗口 chip：已归… · → entries/kb-0014.md
- kb-0016 · decision · 修复计划落库 refs … · → entries/kb-0016.md
- kb-0018 · decision · reqboard 数据层… · → entries/kb-0018.md
- kb-0019 · decision · 迁移门拒绝启动时静默失败… · → entries/kb-0019.md
- kb-0024 · decision · 定位并修复：模型选择器点… · → entries/kb-0024.md
- kb-0026 · decision · dev/integrat… · → entries/kb-0026.md
- kb-0027 · decision · 修复看板/需求详情深链 … · → entries/kb-0027.md
- kb-0028 · decision · DSH 会话分支驱动的 … · → entries/kb-0028.md
- kb-0033 · decision · 交接owner是什么意思 · → entries/kb-0033.md
- kb-0035 · decision · 计划落库未按需求工作区校… · → entries/kb-0035.md
- kb-0037 · decision · 知识层自动自举：插件检测… · → entries/kb-0037.md
- kb-0038 · decision · 归档清单自动收录需求目录… · → entries/kb-0038.md
- kb-0040 · decision · 修复看板需求详情页打不开… · → entries/kb-0040.md
- kb-0041 · decision · 看板卡片显示会话运行中动… · → entries/kb-0041.md
- kb-0042 · decision · 需求详情页「测评证据面」… · → entries/kb-0042.md
- kb-0043 · decision · UI/UX skill … · → entries/kb-0043.md
- kb-0044 · decision · 需求分析阶段：收录 UI… · → entries/kb-0044.md
- kb-0045 · decision · 修写盘根守卫误判：共享单… · → entries/kb-0045.md
- kb-0046 · decision · 修「批准即落库」幂等误判… · → entries/kb-0046.md
- kb-0047 · decision · 详情页文档路径绝对化 +… · → entries/kb-0047.md
- kb-0048 · decision · 修复 Dive 项目归属… · → entries/kb-0048.md
- kb-0049 · decision · 修复 Dive 项目归属… · → entries/kb-0049.md
- kb-0050 · decision · 开窗补齐继承：新窗口写入… · → entries/kb-0050.md
- kb-0051 · decision · 拦截要讲清理由：REQB… · → entries/kb-0051.md
- kb-0052 · decision · 需求详情页 UI 视觉与… · → entries/kb-0052.md
- kb-0054 · decision · 看板运行圈补「后台 ru… · → entries/kb-0054.md
- kb-0055 · decision · 确认门死锁：已落章未推进… · → entries/kb-0055.md
- kb-0056 · decision · 拆分覆盖门补豁免：pro… · → entries/kb-0056.md
- kb-0057 · decision · 验收项由 agent 实… · → entries/kb-0057.md
- kb-0058 · decision · 排查 dsh-app:/… · → entries/kb-0058.md
- kb-0059 · decision · 审计优化／前 5 条落地… · → entries/kb-0059.md
- kb-0060 · decision · 拆分阶段批准门重复弹框：… · → entries/kb-0060.md
- kb-0063 · decision · pm 插件工具面梳理与文… · → entries/kb-0063.md

## 坑

（暂无）
- kb-0072 · pitfall · reqboard 插件潜… · → entries/kb-0072.md
- kb-0073 · pitfall · 修复 reqboard … · → entries/kb-0073.md
- kb-0074 · pitfall · reqboard 体检第… · → entries/kb-0074.md
- kb-0077 · pitfall · 修复 reqboard … · → entries/kb-0077.md
- kb-0078 · pitfall · reqboard 红测试… · → entries/kb-0078.md
- kb-0080 · pitfall · 修复 PM 插件立项弹框… · → entries/kb-0080.md
- kb-0081 · pitfall · 层边界收口：15 处 a… · → entries/kb-0081.md
- kb-0006 · pitfall · 节流不再惩罚正常收尾 +… · → entries/kb-0006.md
- kb-0007 · pitfall · 验收不再要人填结果：ag… · → entries/kb-0007.md
- kb-0012 · pitfall · PM 插件 Agent … · → entries/kb-0012.md
- kb-0015 · pitfall · 修复 Dive 唤醒链：… · → entries/kb-0015.md
- kb-0020 · pitfall · reqboard_mov… · → entries/kb-0020.md
- kb-0021 · pitfall · 修复 reqboard_… · → entries/kb-0021.md
- kb-0022 · pitfall · DSH 席位退役（静默消… · → entries/kb-0022.md
- kb-0025 · pitfall · 实施链可靠性硬化：锁心跳… · → entries/kb-0025.md
- kb-0029 · pitfall · 拆分阶段预判单轮余量：卡… · → entries/kb-0029.md
- kb-0030 · pitfall · 会话右上角流程图 tok… · → entries/kb-0030.md
- kb-0032 · pitfall · 流程图每节点 token… · → entries/kb-0032.md
- kb-0034 · pitfall · token 统计纳入子代… · → entries/kb-0034.md
- kb-0036 · pitfall · 回退把需求埋了：重做卡递… · → entries/kb-0036.md
- kb-0039 · pitfall · 看板运行设置：节点执行次… · → entries/kb-0039.md
- kb-0053 · pitfall · 看板 DAG 不再展示已… · → entries/kb-0053.md
- kb-0061 · pitfall · 修复：弹框作答后不唤醒 … · → entries/kb-0061.md
- kb-0062 · pitfall · 修看板卡面产物门误报「缺… · → entries/kb-0062.md
- kb-0064 · pitfall · 原型门与实现对照判据加固… · → entries/kb-0064.md
- kb-0065 · pitfall · 让验收不再形式合规：堵住… · → entries/kb-0065.md

## 契约

（暂无）

## 术语

- kb-glossary-terms · glossary · 术语表 #terms · → glossary.md#terms

## 代码地图

<!-- kb:generated:begin -->
- kb-code-map-modules · map · 模块级地图与符号检索入口 · → code-map.md#modules
<!-- kb:generated:end -->

## 待写

- 《需求流水线》：六阶段状态机与五道人工门
