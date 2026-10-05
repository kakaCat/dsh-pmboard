# 测试证据（REQ-261004095621-c167）

> 判据口径：**新增失败 = 0**（工作区长期带存量失败：48 个文件 / 98 例；比"失败数字"更可靠的是**失败名称集**）。
> 每条命令都可直接复跑。

## 一、主判据

| 判据 | 命令 | 实测 | 与基线 |
|---|---|---|---|
| 定向回归 | `pnpm vitest run tests/kb-client-page.test.ts tests/client-page-panel.test.ts tests/panel-icon.test.ts tests/client-page-register.test.ts` | **4 文件 / 20 passed** | 全绿 |
| 防呆反向演练 | 把 `register-knowledge.ts` 的图标改回裸对象 → `pnpm vitest run tests/kb-client-page.test.ts` | **1 failed / 5 passed**，`expected undefined to be Symbol(react.element)` | 断言有效；演练后还原，sha256 前缀 `ba3e5107a514253f` 前后一致 |
| 类型闸门 | `npx tsc --noEmit \| grep -c 'error TS'` | **144** | 持平（本需求涉及文件 0 新增） |
| 全量回归 | `pnpm test` | **98 failed / 3637 passed / 20 skipped** | 失败文件 48 个，与开工基线集合逐行一致（`diff` 为空） |
| 知识层 | `pnpm kb:check` | **11 项全过** | 开工时有生成物漂移（前序源码改动所致），`pnpm kb:build` 重生成后零漂移 |
| 构建 | `pnpm build:client`（前序修复已跑） | `[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整` | 通过 |

```bash
# 零新增失败的判据（名称集比对，不是比数字）
pnpm test 2>&1 | grep -E '^ FAIL' | sed 's/ > .*//' | sed 's/^ FAIL  //' | sort -u > /tmp/now.txt
diff /tmp/base.txt /tmp/now.txt   # 空 = 零新增（本次实测为空）
```

## 二、取证脚本的验收（本次交付的新东西）

| 场景 | 命令 | 实测 |
|---|---|---|
| 正常对照 | `node docs/requirements/REQ-261004095621-c167/evidence/extract-asar.mjs` | 表格：`MenuGroup` 使用方 2 / 安装版 0 / 发布版 7；`observeStickyMenuGroups` 1 / 0 / 2；`rankByName` 一致；**退出码 0** |
| 本地补丁检测（新增） | 同上加 `--local ~/Documents/ai/dsh/deepseek-harness/packages/client/ui-primitives/lib/index.js` | `IconBellOutlineRegular`：安装版 2 / 发布版 0 → **本地新增符号 = 安装包被本地构建覆盖**；逐字节对照「对齐 526775 字节，差异 **0**」；结论指向"本机手工打补丁" |
| 严格模式 | 同上加 `--strict` | 退出码 **1**（缺符号或本地补丁即失败，供 CI 用） |
| 归档缺失 | 同上加 `--asar /tmp/does-not-exist.asar` | 打印"取证失败：找不到 app.asar：…"；退出码 **1** |

> 更正说明：初版把归属写成"厂商安装包内部不一致"。用户反馈 `/model` 也不好使后做第二轮取证，
> 发现安装版 `ui-primitives` 与本机 checkout 本地构建**逐字节相同**且带**官方两版都没有**的本地符号
> → 归属更正为**本机手工补丁**；脚本据此新增 `--local` 与「本地补丁检测」段。

## 三、运行时判定（人工执行，需用户配合）

| 编号 | 场景 | 命令 / 操作 | 期望 | 现状 |
|---|---|---|---|---|
| MAN-1 | 现象复核 | 点一次模型控件 → `Slots.listSubTree(root='conversation.input.model')` | 点前 `true`、点后 `false` | **已复现**：唯一占用者 `registrant=mf`、`active=false` |
| MAN-2 | 取崩溃原文 | 复现后看控制台 | `slot entry crashed in 'conversation.input.model': <error>` | **已取到**：React `#130`、`args[]=undefined` |
| MAN-3 | 修复验证 | 用户重装/更新 DSH 客户端后再点 3 次 | `active` 恒 `true` | **待用户重装后执行（本需求未达成项，已在验收材料中响亮报出）** |

## 三点五、人工反馈轮（用户实测）

| 反馈 | 实测结论 | 对交付的影响 |
|---|---|---|
| 用户：`/model` 命令**不好使** | 与缺陷一致：命令弹层与菜单走同一批 primitives API（本地构建缺 `MenuGroup` 等），**换模型的 GUI 通路全断** | 报告 §1/§5 更正：`/model` 不再是规避路径；规避只剩「改 profile 默认模型 + 新建会话」；修复优先级上升为"必须重装" |
| 用户：重启客户端无效 | 与缺陷一致：问题在安装包内（被本地补丁覆盖），重启不改变文件内容 | 报告 §5 明确"重装/更新"而非"重启" |

## 四、未覆盖与跳过项

- `wiki_probe.py` 自检脚本在本机不存在（`agent-deepseek-harness/agent-dh/scripts/wiki_probe.py` 未找到），按任务卡说明跳过并在此记录。
- 端到端 GUI 自动化未引入（设计边界 C：本期不新增测试框架）→ MAN-3 由人工完成。

## 五、任务覆盖（covers）

> 每张任务卡（含子卡）对应的可复核判据，逐条列明；「判据」即上文表格里的命令与实测。

- covers: t-8a0ccf（父卡：知识层 pitfall 条目）—— 判据：`pnpm kb:check` 11 项全过；`reqboard_kb(query=席位退役)` 命中 kb-0022
- covers: t-063e37（子卡·研发）—— 判据：kb-0022 落盘 + INDEX 指针行（`git status` 可见条目文件与 INDEX 改动）
- covers: t-9fbf44（子卡·复核）—— 判据：K5 条目与索引一一对应 + 指针可解析（kb:check 输出）
- covers: t-d434a0（父卡：取证脚本）—— 判据：§二 三场景（缺省 0 / --strict 1 / 归档缺失 1）
- covers: t-07771e（子卡·研发）—— 判据：脚本正常对照输出表（安装版 0/0、发布版 7/2）与结论行
- covers: t-817bc5（子卡·复核）—— 判据：失败路径与退出码实测 + 报告 §3.1 回链可复制执行
- covers: t-921b6b（父卡：回归确认）—— 判据：§一 定向回归 20 passed + 反向演练必红 + 基线持平
- covers: t-821cf5（子卡·研发）—— 判据：反向演练实测（`expected undefined to be Symbol(react.element)`）+ 还原哈希一致
- covers: t-25c1c3（子卡·复核）—— 判据：对照 design/test-cases.md 无偏离（TC-1/TC-6 + 基线）
- covers: t-4b4fcd（子卡·测试）—— 判据：`pnpm test` 98 failed / 3637 passed，失败文件集合与基线 diff 为空；`tsc` 144 持平
- covers: t-6572b7（父卡：说明书新节）—— 判据：`grep -n 席位 docs/architecture/project-manual.md` 命中 568/575/583/596
- covers: t-49327a（子卡·研发）—— 判据：新节含三步判别法表 + 注册面清单表 + 红线；变更记录追加一行
- covers: t-f04190（子卡·复核）—— 判据：新节引用路径真实存在；与报告/kb-0022 口径一致（无第二套说法）
