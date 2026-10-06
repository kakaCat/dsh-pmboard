# t-bce26d 同步既有渲染断言（五处改动 + 两条新增）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
同步既有渲染断言（五处改动 + 两条新增）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
① `npx vitest run tests/report-shell.test.ts tests/report-firstscreen-gaps.test.ts` 全绿；② `git diff --stat` 显示两份测试文件的改动恰好是清单处数（report-shell 改 1 处 + 新增断言块，firstscreen 改 2 处 + 新增两条），且 tests/report-shell.test.ts:138 与 Tab 栏用例逐字未改；③ `pnpm test` 失败数 ≤ 基线 106 且改过的用例全绿；④ 可失败性自证：临时去掉渲染里的 aria-describedby 后新增断言①报红，恢复后复绿。

## 实施方案（implementation）
改 tests/report-shell.test.ts 与 tests/report-firstscreen-gaps.test.ts：report-shell 的 :219 toContain(均需人工确认) 改为「需人工确认」；:138 的按序子串断言不改（属性追加在既有属性之后）；:212 的 countOf(html, dsh-pm-action-consequence) === 1 保持（保留该 class 作 sr-only 节点，须在实施汇报里显式声明）。firstscreen-gaps 的 :447 countOf(html, 均需人工确认) === 1 改为「需人工确认」；:411 expect(grid).not.toContain(本阶段操作) 不改；:419 的 countOf 与 toContain(通过即归档) 不改；:450 countOf(html, data-human-only=true) === ACTIONS.length 不改；:450-457 的 auto 用例 not.toContain(均需人工确认) 改为「需人工确认」（否则变成永远为真的空断言）。新增两条：① 主操作按钮有 aria-describedby 且指向节点文本 === 服务端 consequence、节点视觉隐藏；② 行尾标文本 ===「需人工确认」且 data-human-only-mark=1 仍在。按 FR-13 把既有相关断言改成不存在（头部无 dsh-pm-comment-form 与头部 add-comment），并新增「对话 Tab 评论框仍存在且可提交」一条。不许删断言。

## 上游产出摘要（dependsSummary）
- 操作条文案收敛并真删 DOM 节点（含两处提示文案同步）
- 真删详情页评论输入框并保住对话 Tab 评论链路

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T14:27:48.916Z，窗口 session-643f0678-d7a2-4785-8b1e-df0511c3f190）

父卡收尾：既有渲染断言同步完成，零删除、可失败

### 完成项

- 两份测试文件按卡面清单同步：五处改写 + 三条新增 + 一条加强，零删除
- 新增断言：aria-describedby 指向节点文本等于服务端 consequence；头部不渲染评论输入框
- 对话 Tab 评论框仍在且可提交（防删过头）
- 可失败性自证：去掉 aria-describedby 即报红，恢复后 84 例全绿
- 三张子卡（t-fd33fe / t-3b01f0 / t-98db4f）全部 done

### 改动文件

- `tests/report-shell.test.ts`
- `tests/report-firstscreen-gaps.test.ts`
- `tests/dialogue-panel.test.ts`
- `tests/report-degrade.test.ts`

### 下一步

下一张：t-5c0373 探针可访问性断言组

---
