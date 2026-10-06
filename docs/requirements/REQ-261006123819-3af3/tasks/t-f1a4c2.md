# t-f1a4c2 提交判据脚本与本需求收尾提交

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
提交判据脚本与本需求收尾提交

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① 未提交时 pnpm commit:check --req REQ-261006123819-3af3 → exit 1（FAIL）；提交后 → exit 0（OK），两个方向都验；② git log --oneline --grep=REQ-261006123819-3af3 | wc -l ≥1；③ git show --stat <本需求提交> 的文件集合 ⊆ 本需求改动清单且不含其他需求目录；④ 提交后 git status --porcelain | wc -l 仍非 0（其他窗口的在飞改动），该缺口如实写进验收材料。

## 实施方案（implementation）
新建 scripts/commit-check.mts：参数 --req <REQ-id>，执行 git log --oneline --grep=<REQ-id>，非空打印 OK 并 exit 0，空打印 FAIL 并 exit 1（package.json 的 commit:check 脚本已在 t1 加齐）。收尾提交：按本需求改动清单逐个 git add（禁用 git add -A，工作树有多个窗口的在飞改动），提交信息带需求 id，提交后用 pnpm commit:check --req REQ-261006123819-3af3 验证，并把「存量未提交文件仍悬空」作为已知缺口写进验收材料（D-1）。

## 上游产出摘要（dependsSummary）
- 放宽工厂扫描并把 bind/handoff 纳入契约覆盖
- 删除无写入者的归档时间字段与读取分支
- 规范面改写口径并新增 C-28 提交判据
- 证据模板带工作树指纹并登记降级

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
