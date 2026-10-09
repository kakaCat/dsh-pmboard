# 交付自评审（REQ-261008020617-088f）

> 谁写的：owner 窗口（session-914181c9）。范围：本次交付的全部改动 + 未做之事。**不含**人工验收裁决。

## 一、结论

15 处 application/ I/O 越界全部清零；层门 application 用例由红转绿（整文件 failed 用例 **2 → 1**，
剩下的是边界外的 `tools/`+`http/` 状态字面量，**未修、也未进豁免台账**）；`npx tsc --noEmit` 0 错；
全量 15 条失败逐条可归因且与本次改动无关。**可以验**。

## 二、等价性证据（重构的关键，逐条可复核）

1. **三门语义逐字等价**：临时脚本对迁移前后的 fail 消息 / `code` / `gaps` / pass 消息 /
   `rtm_not_found` 形状做了 15 条断言，全 OK；三份单测**断言一字未改**仍然全绿。
2. **落盘形状不变**：`rtm-failures.json` 五键 + 2 空格缩进 + 最近 100 条，由既有用例继续钉住。
3. **两处路径判定的错误码与两句文案**逐句钉住（`tests/workspace-root-resolution.test.ts`）。
4. **门禁没被放宽**：`LAYER_RULES` 与 HEAD **逐字节相同**（md5 对照）。
5. **豁免面真会响**：端到端写入 1 条过期豁免 → 当场点名并红；还原即绿。

## 三、偏离申报（计划/设计与实际执行的差异，共 6 条）

| # | 偏离 | 理由 | 影响 |
|---|---|---|---|
| 1 | 计划说「五处装配点」，实测 6 处（多出 `tests/task-status-integration.test.ts`） | 编译器抓出，正是"必填字段当漏改清单"的设计意图 | 无（越补越全） |
| 2 | 设计与需求文档写的 `diag-log` 只有 1 个 application 引用方 → 实测 6 个 | 前一轮 grep 被 `head` 截断致误判 | RF-4 由"迁文件"改为"无 I/O 门面 + 适配器"；判据同步修订 |
| 3 | `HostFsPort` 由 6 个方法扩到 7 个（增 `existsAbs`） | 保住 create 侧「目录不存在」与「目录不存在或不可读」两句文案的区分 | 端口面扩大一处，已在 `interfaces.md` 记录 |
| 4 | 子卡模板验收「layer-boundary 全绿」不可执行 → 改为可执行锚点（越界条数 + 目标用例） | 该文件另有一条边界外的红（D-1 已裁定） | 子卡验收标准按工具文档用法修订并留痕 |
| 5 | 知识层由「最小手改」改为按 C-13 重生成（`kb-build --write`） | code-map 的模块表含文件数/字符数/导出数三类统计，手改必错；生成物是 src 的确定函数 | code-map 零漂移；重生成只改了 `code-map.md` 与 `code-map.symbols.tsv`（其余生成物"内容一致"被跳过） |
| 6 | 未做 git 提交 | 本需求触及的 `index.ts` / `ports.ts` 等文件里带**别的窗口在途 hunk**，显式路径 `add` 会把它们一并提交 | 回滚口径从"逐文件 git checkout"改为"按关键字摘出本需求改动"（每条插桩带 REQ 号或端口名） |

## 四、本次顺带发现的两类真实缺陷（已有用例或约定钉住）

1. **强转构造的夹具会掩盖必填端口**：15 份夹具用 `as unknown as UseCaseDeps` 造 deps，缺 `hostFs`
   时 tsc 看不见，运行期表现为 `/state` 的 `rtm_health` 静默缺失。已逐份补齐，并写进说明书机制备忘。
2. **`node:path.isAbsolute` 是逐平台的**：最初按「POSIX + win32 并集」实现，被逐例对照用例抓出
   （POSIX 下反斜杠开头应判 `false`）——不经对照就发版会是一处静默行为变化。

## 五、边界外如实留痕（未做之事）

- `src/http/routers/{requirements,stages,settings,settings-support}.ts` 的状态字面量：另一条腿，未修。
- `tests/message-hygiene.test.ts` 的 3 条红：另一条腿，一行未碰。
- 三个门的死码去留（生产零引用）：本需求取"合并 + 保留同名导出"，是否删除另立项。
