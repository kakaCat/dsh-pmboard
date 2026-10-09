---
title: 工具面清单与精简手册（27 → 19 之后）
updated: 2026-10-08
source: REQ-261007220012-bd29 + REQ-261008020552-4aa0
---

# 工具面清单与精简手册

> **TL;DR**：agent 工具面从 **27 → 21**（2026-10-07，REQ-261007220012-bd29）→ **19**
> （2026-10-08，REQ-261008020552-4aa0：archive_amend / note_interruption 收编为 task_amend 的
> op=archive / op=interruption）。
> 精简的判据是「**一个槽位一桩事**」——每个常驻工具 schema 每轮请求都要重发，
> 冗余槽位的代价是 token 与「选错面」概率；但**删工具是硬断**，所以本页给出：
> ① 19 个槽位的现状清单；② 五处必须一致的口径；③ 退役/合并的**可复用动作序列**与同步面清单；
> ④ 什么绝对不能顺手改。

## 一、19 个槽位（按用途分 5 组） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

| 组 | 工具 |
|----|------|
| 立项与自查 | `reqboard_capture` / `reqboard_create` / `reqboard_status`（含 run 节） |
| 阶段推进与人工门 | `reqboard_submit` / `reqboard_ask_confirm`（含 ticket 取回执） / `reqboard_move` / `reqboard_accept_sheet` / `reqboard_clear_pause` |
| 拆分与任务 | `reqboard_decompose` / `reqboard_task_move` / `reqboard_task_report` / `reqboard_task_tree`（含 task_id 单卡展开） / `reqboard_task_amend`（op=refs/adopt/chain/archive/interruption） |
| 自动实施链 | `reqboard_task_run` |
| 协作与环境 | `reqboard_open_window` / `reqboard_bind` / `reqboard_handoff` / `reqboard_kb` / `reqboard_skill_install` |

## 二、五处口径必须一致（否则门禁当场红） <!-- serves: FR-7 -->

| # | 口径 | 派生校验 |
|---|------|----------|
| 1 | `src/tools/registry.ts` 的 `TOOL_REGISTRY`（**唯一手写答案**） | — |
| 2 | `src/tools/` 磁盘目录集合 | `tests/tools-dispatch.test.ts`（I-1） |
| 3 | `apply()` 后宿主注册名集合 + 装配日志条数 | `tests/apply-wiring.test.ts`（I-2）、`tests/registry-log.test.ts` |
| 4 | `README.md` 工具表（行数 / 名字集合 / 表头计数） | `tests/readme-tool-face.test.ts` |
| 5 | `package.json` description 的计数 | 同上第 2 条用例 |

另有两处**容易漏**的连带面：
- `tests/fixtures/error-code-inventory.json`：每个大写错误码的 `site.file` 指向工厂文件——
  改目录/改名后必须 `npx tsx tests/drill/refresh-error-code-inventory.mts` 刷新（S5 实测踩到）。
- `src/domain/prompt/fragments/**`：注入片段里若提到工具名，改完要 `node scripts/inline-prompt-fragments.mjs`
  重新生成 `src/domain/prompt/generated/fragments.ts`（S2 实测踩到）。

## 三、退役 / 合并的动作序列（S1~S6 的可复用形态） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

1. **删纯别名**：与主入口同 factory 的兼容名 → 直接删目录 + 摘 18 处同步面（含 render 覆盖白名单）。
2. **并入单入参取件口**：给存续工具加**可选**入参（如 `ask_confirm(ticket)`）→ 分派顺序写在壳里
   （有值就分流），用例**判定逻辑不动**，只改错误消息抬头。
3. **并入重叠查询面**：把被并工具的输出**挂成新节/新模式**（`status.run` / `task_tree(task_id)`），
   **保留降级形状**（无值时整键省略，不发 null）与**判别位**（`status='not_found'` 且不编错误码）。
4. **合并同语义簇**：`op` 必填 + 各 op 必填集点名（`REQBOARD_INVALID_INPUT` 的 message 必须可读）；
   分派到原用例，用例零改动。
5. **改名消债**：`git mv` 目录 + 工厂/常量/registry `key`/import/测试同步；**工具名不变**。
6. **重复 schema 单源化**：抽到 `src/tools/shared.ts`（`WINDOW_MODES` / `windowInheritanceSchema()`）；
   子 schema 用**函数**返回新对象（编译层会消费引用）。

**硬纪律**：一次只改一类（一批一 revert）；删工具必须有人的明确授权（本批授权「不用的工具可以删除」）；
合并后**旧名调用会得到 unknown tool**——这是有意行为变化，必须在 README/description 里改口径，不得留旧指路。

## 四、不许顺手改的（本批的边界） <!-- serves: FR-2, FR-3, FR-4 -->

- **被并工具的用例判定逻辑**：只许改错误消息抬头；拒绝条件、幂等、留痕格式一律不动。
- **台账与状态机**：工具面是装配期事实，删/改名**不产生数据迁移**（本批零迁移，见需求 design/data-model.md）。
- **`target` 类必填约束的放宽必须由用例兜底**：`ask_confirm` 的 `target` 从 required 放宽为可选
  （否则 ticket-only 调用在绑定层就被拒），发起确认路径的校验改由用例承担——放宽的是**绑定层**，不是语义。

## 五、已知遗留 <!-- serves: FR-7 -->

- `tests/handoff.test.ts` 有 2 例长期红（`REQBOARD_DEPENDENCY_GATE`），与本批零交集，属另立需求。
- 工作树载有多条需求的未提交改动时，「pnpm test 全绿」不可达；验收口径应为**逐批差分新增红 = 0**。
- `dist/` 需 `pnpm build` 才反映新工具面；插件运行期按启动时的 dist 跑（见手册《改了 src 并 build 过 ≠ 线上生效》）。
