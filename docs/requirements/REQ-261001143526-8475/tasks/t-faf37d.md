# t-faf37d 写同步脚本 kb-conventions-sync（骨架生成 + 漂移检查）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
写同步脚本 kb-conventions-sync（骨架生成 + 漂移检查）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx tsx scripts/kb-conventions-sync.mts --write 连跑两次第二次零差异；手改一条既有条目后重跑该命令，手改内容仍在（grep 命中）；删一条覆盖条目后 npx tsx scripts/kb-conventions-sync.mts --check 退出码 1

## 实施方案（implementation）
scripts/kb-conventions-sync.mts：读 package.json 的 scripts + t1 三张表 → 与 conventions.md 的 ## 工程操作 节比对 → --write 为缺口追加骨架（命令/期望/时机自动填，「失败怎么办」留待补）+ 重写 docs/knowledge/operations.tsv；--check 有缺口或 tsv 漂移 → 退出码 1；编号取现有 C-NN 最大值 +1。

## 上游产出摘要（dependsSummary）
- 定覆盖清单与四要素判定（纯函数）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T06:49:29.916Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

写规范这件事从「凭记忆」变成「填空」：缺哪条，脚本就把骨架摆好（命令与期望都填好），人只补一句「坏了怎么办」。

### 完成项

- scripts/kb-conventions-sync.mts：--write 追加候选骨架（命令/期望/时机自动填）+ 重写覆盖清单 + 补索引行；--check 有缺口/漂移即非零退出
- 幂等：连跑两次规范页零变化；已有条目一字不改（按 id 判定）
- 演练固定：删一条 → kb-probe 红（K10 缺口）→ --write 生成骨架 → 补全 → 绿（evidence/t7-drill.txt）
- 修复演练暴露的真 bug：TSV 必须在「追加骨架之后」重算，否则新条目停在 (缺) 立刻报漂移

### 改动文件

- `scripts/kb-conventions-sync.mts`
- `src/domain/knowledge/operations.ts`

### 下一步

t3 K10 门禁

---
## 汇报 2（2026-10-01T07:04:44.209Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

缺规范时脚本把骨架摆好，人只补一句「坏了怎么办」；这条链已用演练证明能红能绿。

### 完成项

- scripts/kb-conventions-sync.mts（--write/--check）+ package.json 的 kb:conventions
- 幂等与缺口检测；演练四步 1→0→0→0（evidence/t7-drill.txt）
- 修复 TSV 时序 bug

### 改动文件

- `scripts/kb-conventions-sync.mts`
- `package.json`

### 下一步

t5 规范页内容

---
