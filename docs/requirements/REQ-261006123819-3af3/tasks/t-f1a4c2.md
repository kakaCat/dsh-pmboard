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
## 汇报 1（2026-10-06T06:17:18.531Z，窗口 session-af0ee362-fa98-4396-a5d7-856681a42843）

提交判据脚本落地并完成带需求 id 的收尾提交；缺口（哪些改动仍在工作树）逐条登记，不冒充完整交付。

### 完成项

- 新增 scripts/commit-check.mts：C-28 的可跑判据（--req <REQ-id> → OK/exit 0 或 FAIL/exit 1；用法错 exit 2）
- 两方向都实测：未提交 FAIL exit 1；提交后 OK exit 0
- 收尾提交 917b39d 带需求 id，提交信息显式标注「部分提交」
- 提交内容：registry.ts、ArchivedMoment.ts、commit-check.mts 与本需求全部文档（含 D-7/D-8 裁定、FR-6 降级登记）
- 判据③：越界文件数 0；判据④：提交后工作树仍 422 个改动（缺口如实保留）
- 缺口登记（D-1）：工具契约派生与两处安全网、归档门三态与客户端消费、知识层索引/规范/生成物、模板与 package.json 等改动仍在工作树
- 未纳入原因（实测）：与别窗口在飞改动逐文件交织；hunk 级暂存会损坏文件（conventions.md 丢正文、QueryDocs.ts import 错位）；node-panel.ts 整文件提交会带上未提交依赖导致编译不过
- 处置依据：人工裁定 D-8「只提交本需求的 hunk」+ 弹框裁定「只提交新文件 + 本需求文档」；不冒充为完整交付

### 改动文件

- `scripts/commit-check.mts`
- `src/tools/registry.ts`
- `src/domain/status/ArchivedMoment.ts`
- `docs/requirements/REQ-261006123819-3af3/requirement.md`

### 下一步

七张父卡全部收口；需求应自动进入验收态，验收材料需引用本卡的缺口清单与笔记文件。

---
