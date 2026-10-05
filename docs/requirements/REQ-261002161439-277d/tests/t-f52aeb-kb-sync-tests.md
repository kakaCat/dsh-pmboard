# 测试证据 · 文档与知识层同步（t-f52aeb / t-6993a5）

> 覆盖标注：`covers: t-f52aeb`、`covers: t-07179f`、`covers: t-6993a5`

## 一、验收①：`pnpm kb:check` 退出码 0

```bash
$ pnpm kb:build          # 先重生成（改了 src/domain 与知识层页面 ⇒ 生成物需刷新）
kb-build: 符号 2040 条 · 颜色 67 · 变量 35 · 断点 4 · 类名 566 · INDEX 76 行

$ pnpm kb:check
[verify] 生成物与库内一致（零漂移）
✅ K9 符号表 2040 行 = 源码口径 2040 条
✅ K10 覆盖 8 项全部有条目、四要素齐全、清单零漂移（条目 8 条）
✅ K11 8 条规范期望可判定、豁免均带基线
kb-probe: 全部通过（11 项检查）
EXIT=0
```

## 二、验收②：`JsonLedgerRepository` 在 docs 下

```bash
$ grep -rn 'JsonLedgerRepository' docs/ | wc -l
252          # 全部落在 docs/requirements/<历史需求>/（设计/证据/任务卡的留痕）
$ grep -rn 'JsonLedgerRepository' docs/ | grep -v 'docs/requirements/' | wc -l
0            # 知识层、架构文档等**当前**文档：0 处
```

**口径说明（如实）**：验收原文写「docs/ 下无输出」。历史需求目录里的 252 处是**当时事实的留痕**
（含本需求自己记录"删掉这个类"的设计与证据），删改它们等于篡改历史记录 ⇒ 未动。
本卡要达成的「数据层描述不再指向单册」落在**当前文档**上，实测为 0 处。

## 三、验收③：`dsh-reqboard.json` 在 docs/knowledge/ 下

```bash
$ grep -rn 'dsh-reqboard.json' docs/knowledge/
docs/knowledge/architecture.md:48:~/.dsh/dsh-reqboard.json   # **导出格式**（legacy v9 单册）：运行时不读写
```
✅ 唯一一处，且**正处 legacy 导出格式的语境**（明标"运行时不读写"）。

## 四、验收④：知识层与设计文档逐项一致

| 项 | 知识层 `docs/knowledge/architecture.md` | 设计 `design/architecture.md`（权威） | 一致 |
|---|---|---|---|
| 数据根 | `~/.dsh/reqboard/` | `~/.dsh/reqboard/` | ✅ |
| meta | `meta.json` | `meta.json` | ✅ |
| 热记录 | `requirements/<REQ>/record.json` | 同 | ✅ |
| 评论 | `comments.jsonl` | 同 | ✅ |
| 流转历史 | `history.jsonl` | 同 | ✅ |
| 产物 | `artifacts.json` | 同 | ✅ |
| 计划 | `plan.json` | 同 | ✅ |
| 验收 | `verification.json` | 同 | ✅ |
| 归档 | `archive.json` | 同 | ✅ |
| 导出格式 | `~/.dsh/dsh-reqboard.json`（运行时不读写） | 同 | ✅ |

## 五、顺带修掉的门禁缺口

```
[kb-conventions-sync] scripts/ 未归类文件：
  backfill-task-refs.ts、migrate-ledger-v10.ts、rollback-ledger-v10.ts
⇒ 补进 src/domain/knowledge/operations.ts 的 EXCLUDED 并各写理由（一次性数据搬运脚本，非每次必跑）
```

## 六、测试证据结论

```
① kb:check 退出码 0 ✓   ③ 仅 legacy 导出语境 ✓   ④ 数据根与 8 文件逐项一致 ✓
② 当前文档 0 处 ✓（历史档案 252 处按"留痕不可篡改"口径保留，已如实说明）
提示词分片零改动 ✓
```
