# REQ-261004103330-005f 归档材料 · 看板运行设置（节点回合上限 + 数据库开关 + SQLite 实现）

> **TL;DR**：看板新增「⚙ 设置」弹窗，把三件事从代码里搬到界面上——**每阶段还能自动跑多少回合**、
> **台账存文件还是存 SQLite 库**、**这台机器上发生过什么**。15 张卡 + 两轮返工（原型对齐、默认值下限），
> 新增约 40 个文件、300+ 条用例；三条端到端链条跑通，其中一条抓出并修复了一个**假承诺**
> （设置文件里的后端选择此前重启也不生效）。

## 一、需求目录

`docs/requirements/REQ-261004103330-005f`

## 二、文档清单

| kind | 路径 |
|---|---|
| requirement | docs/requirements/REQ-261004103330-005f/requirement.md |
| plan | docs/requirements/REQ-261004103330-005f/decomposition.md |
| verification | docs/requirements/REQ-261004103330-005f/verification.md |
| notes | docs/requirements/REQ-261004103330-005f/reviews/review-report.md |
| notes | docs/requirements/REQ-261004103330-005f/tests/test-evidence.md |
| notes | docs/requirements/REQ-261004103330-005f/notes/baseline.md |
| notes | docs/requirements/REQ-261004103330-005f/notes/findings.md |
| notes | docs/requirements/REQ-261004103330-005f/notes/prototype-parity.md |
| notes | docs/requirements/REQ-261004103330-005f/notes/t2-upstream-notes.md |
| notes | docs/requirements/REQ-261004103330-005f/notes/t7-upstream-notes.md |
| notes | docs/requirements/REQ-261004103330-005f/design/architecture.md |
| notes | docs/requirements/REQ-261004103330-005f/design/interfaces.md |
| notes | docs/requirements/REQ-261004103330-005f/design/data-model.md |
| notes | docs/requirements/REQ-261004103330-005f/design/frontend.md |
| notes | docs/requirements/REQ-261004103330-005f/design/backend.md |
| notes | docs/requirements/REQ-261004103330-005f/design/test-cases.md |
| notes | docs/requirements/REQ-261004103330-005f/design/use-cases.md |
| notes | docs/requirements/REQ-261004103330-005f/prototype/board-settings.html |
| notes | docs/requirements/REQ-261004103330-005f/prototype/parity-limits.png |
| notes | docs/requirements/REQ-261004103330-005f/prototype/parity-storage.png |
| notes | docs/requirements/REQ-261004103330-005f/prototype/parity-records.png |
| notes | docs/requirements/REQ-261004103330-005f/prototype/parity-general.png |

## 三、合并去向（**已真写进项目文档**）

1. **`docs/architecture/settings-and-storage-backend.md`（新增 L2 领域篇）**——把这套机制的八节写全：
   上限的四级来源与同步快照（为什么必须同步、默认值为什么不能抄进设置文件、改小不掐断在跑那一轮、
   内置默认下限 5）· 存储后端切换与人工确认门（两道防线、面板不是"那个同意"、切到已在用的后端 400 且不烧票据）·
   一次性迁移八步（暂存库为什么比"事务内回滚"硬、源只读、dry-run 连档案都不写、留痕为什么包在最外层）·
   系统记录（启动自动建、路径每次刷新、损坏不 500、两个丢事件计数不相加）· 未就绪拒服务不返回空册 ·
   可跑判据 · 四条已知留白 · 两条方法论。
2. **`docs/architecture/project-manual.md`（更新两处）**——
   - 「本手册怎么用」索引表新增一行，指向上述 L2 篇；
   - 新增「机制备忘：运行设置的三条硬口径与两条方法论」（三条硬口径 + 形态也要有会红的断言 /
     改完立刻跑检查）。

## 四、一句话索引条目

看板可改每阶段回合上限（四级来源、同步快照、改小不掐断在跑那一轮、内置默认下限 5），可把台账切到
SQLite 库（一次性票据的人工确认门、否定作答不可消费、迁移先备份再建库且失败不伤源数据），
并在系统记录里留档（路径档案 / 后端使用史 / 迁移与回滚 / 版本一致性）。

## 五、说明书更新点

| 文档 | 章节 | 多了什么认知 |
|---|---|---|
| docs/architecture/project-manual.md | 本手册怎么用（索引表） | 新增一行指向《运行设置与存储后端切换》，让人从 L1 就能找到这套机制 |
| docs/architecture/project-manual.md | 机制备忘：运行设置的三条硬口径与两条方法论 | ① 上限读取口必须同步 + 默认值不许抄进设置文件 + 改小不掐断在跑那一轮 + 默认下限 5；② 确认门两道防线且面板不是"那个同意"；③ 迁移用暂存库的取舍；以及"形态也要有会红的断言""改完立刻跑检查"两条方法论 |

## 六、已知留白（不掩盖）

1. **浏览器手测未做**（本窗口无 GUI 通道）：点页头按钮、ESC/遮罩关闭、重开保态只有 DOM 级用例与
   构建产物验证，缺真机点击——这是验收单里由人确认的一项。
2. **迁移留痕缺"谁确认的 / 哪个窗口执行的"**：脚本 CLI 没有对应参数，只在程序化调用时能带。
3. **`ports.ts` 在本需求里又长了约 94 行**（该文件 HEAD 版即 589 行、早已超尺寸门禁）：
   红线不是本需求画的，但我们在红线边上又加了一笔；后续宜按主题拆该文件。
4. **端口缺显式写后端方法**：当前以单点类型放宽顶上，未来调用方照抄会绕开确认门。

> 说明：本仓 `agent-dh/scripts/wiki_probe.py` 在本工作区不存在（无 `agent-dh/` 目录），故未跑该自检；
> 新页与 L1 的链接已人工核对（`project-manual.md` 两处指向 `settings-and-storage-backend.md`，文件真实存在）。
