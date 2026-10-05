# t-fb2cff 收口：四门禁 + GUI 手工证据

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
收口：四门禁 + GUI 手工证据

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
evidence/lane-scroll-gui.png 与 evidence/gates.txt 在场且 gates.txt 含命令原文与实测输出；pnpm build exit 0；pnpm test 失败数 ≤ 基线 106；pnpm typecheck ≤ 223；npx vitest run tests/board-lane-scroll.test.ts 全绿。

## 实施方案（implementation）
按 docs/requirements/REQ-261004184822-9881/design/test-cases.md 的 TC-7 在 GUI（http://127.0.0.1:19387 → 看板 → 泳道）跑手工验收：横滚到 accepting 列后三连刷（手动刷新/等一轮 20 秒轮询/另一窗口改一条需求触发 SSE）、某长列内翻到底再刷新、把窗口拉矮一半；截图落 evidence/lane-scroll-gui.png。四门禁读数（build / build:client / typecheck / test 失败数与基线比对）落 evidence/gates.txt。

## 上游产出摘要（dependsSummary）
- 列直通到底：列高铺满可视区、列内自己滚

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T11:08:04.504Z，窗口 session-1c72e30b-075a-4375-a0e5-022885505cf8）

这一步做完，交付可以交给人验收了：证据成文件、读数可比对，缺口也写在明面上而不是藏着。

### 完成项

- 四门禁读数落 evidence/gates.txt（命令原文 + 实测输出 + 构建戳）
- GUI 人工验收三条全部通过，答复原文落 evidence/lane-scroll-gui.md
- 如实记录替代与缺口：截图改为人工文字记录；矮窗口、列头可见、SSE 单次触发、刷新回最左四条边界本轮未人工覆盖
- 子链三段走完：研发、复核、测试；四张父卡全部 done

### 改动文件

- `docs/requirements/REQ-261004184822-9881/evidence/gates.txt`
- `docs/requirements/REQ-261004184822-9881/evidence/lane-scroll-gui.md`

### 下一步

进入验收：提交验收材料（reqboard_submit kind=verification），由人逐项裁决

---
