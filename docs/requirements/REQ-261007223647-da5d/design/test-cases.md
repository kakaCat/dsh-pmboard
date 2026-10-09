---
doc: design/test-cases
req: REQ-261007223647-da5d
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 测试策略（REQ-261007223647-da5d · 轻档）

## 验收口径（跑什么、看到什么算过） · serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

| 命令 | 期望 | 规范条目 |
|---|---|---|
| `pnpm vitest run` | 退出码 0，与基线比对无新红 | C-14 |
| `pnpm tsc --noEmit` | 退出码 0 | C-15 |
| `pnpm build` | 退出码 0，dist/ 与 lib/client.js 均有新产物 | C-11 |
| `pnpm build:client`（改了 client 时） | 输出 `[verify-client] OK`（符号/归属章/CSS 分片齐） | C-12 |
| `grep -rn "三问\|四问" src/tools src/application` | 命中 0 或全部与 4 问事实源一致 | FR-4 |

## 新增/改造用例清单 · serves: FR-1, FR-2, FR-3, FR-5, FR-6

| 用例 | 断言 | serves |
|---|---|---|
| capture-mapping 题目构造 | 首项 label 带（推荐）后缀且 = titleOptions[0]；✖️ 居末；问项总数 4；题干含理由行 | FR-3 |
| capture-mapping 映射 | 带后缀 selected 剥后缀后类型/难度不回落默认；「全部按推荐值」→ defaultsUsed 含后 3 问；location 绝对路径拆 (root, base) 三态 | FR-3 |
| askTimed 适配器 | 超时 → {kind:'pending'} 不抛；answered → 原答案；越界 → REQBOARD_INVALID_INPUT | FR-1 |
| AskConfirm 超时票 | 宽限到期 → 回执 pending+ticket，registry 内票活；receipt 可取 | FR-1 |
| gate redispatch | reused+redispatch 不新建门、不写台账、不重签；POST repost 跨窗口 → UNKNOWN_TICKET | FR-1, FR-5 |
| capture-interactions | cancel×3/30min → 不再弹框且回执含看板提议；旧 rejections 文件合并读 | FR-2 |
| /state pending 投影 | 有票 → 载荷 6 键齐；无票 → []；remaining_ms 推导公式单测 | FR-5 |
| PendingConfirmBand 渲染 | 有票 → Band+行+两按钮在场（断言选择器）；无票 → 零渲染 | FR-5 |
| open-doc 根诊断 | 缓存缺失 → rootSource=session-root/server-root/none；串会话缓存 → 不串 req-root；红字徽章出现条件 | FR-6 |
| capture-output-contract | CAPTURE_ANSWER_KEYS 4 键（location 替 workspace）键集断言 | FR-3, FR-4 |

## 文案漂移扫描（防回潮） · serves: FR-4

契约扫描测试（tests/output-contract 族）同步更新问数口径；submit prompt 补 prototype 后
快照/扫描断言「六类」字样与枚举一致。

## 手测锚点（人验，验收阶段用） · serves: FR-3, FR-5

- 立项弹框：推荐项宿主预选态可见；✖️ 在末位；「全部按推荐值」一次点击完成立项（原型 #FR-3 对照）；
- 看板首屏：制造一张 pending 票 → 10 秒内可见剩余时间与两按钮（原型 #FR-5 对照，对齐规划 J3）。
