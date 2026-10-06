# REQ-261006115829-dafb 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：返工交付（v2）：v1-2 的第三条判据由「整页 numstat 删除列为 0」改为 hunk 级「本次交付 hunk 纯增 + 删除行点名归属」——共享/脏工作树下整页口径必红，会把别的会话的删除算到本卡头上。修订已落三处（卡片 acceptance、design/test-cases.md 的 TC-2 与新增 TC-5），任务覆盖度回到 13/13；复跑通过：入链 2 行分落两页、命中行含 rev、我的两个 hunk（@@ -12,0 +15 @@ / @@ -41,0 +42,6 @@）纯增零删除，整页 3 处删除逐行点名到别的 hunk。上轮已过项不重验，本轮只重验 v1-2。

## 1. 验收列表

### v2-1 · 两处入口回链（说明书索引 + 运行前提页机制一句）

**验收内容**：【两处入口回链（说明书索引 + 运行前提页机制一句）】验收

**操作步骤**：
1. ① grep -rn 'plugin-reload-troubleshooting' docs/architecture/ → 命中 ≥ 2 行，且分别落在 project-manual.md 与 plugin-runtime-prerequisites.md
2. ② plugin-runtime-prerequisites.md 的命中行含 rev
3. ③ git diff --numstat 两页 → 删除列（第二列）为 0

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：按修订后口径复验：① docs/architecture/ 入链 2 行分落 project-manual.md:15 与 plugin-runtime-prerequisites.md:46；② 后者命中行含 rev（命中 1）；③ 我的 hunk 为 @@ -12,0 +15 @@ 与 @@ -41,0 +42,6 @@，纯增零删除；整页 3 处删除逐行点名到别的 hunk。

**验收状态**：✓ 通过

---

## 2. 测试报告

- 返工判据修订：卡片 t-fcd6b0 的第三条判据改为 hunk 级；design/test-cases.md 的 TC-2 写入同名口径与理由
- 新增 TC-5（返工口径的用例，hunk 级）：covers t-fcd6b0 / t-b3071a / t-f42ec3，任务覆盖度回到 13/13
- ① 入链：grep -rn plugin-reload-troubleshooting docs/architecture/ → 2 行（project-manual.md:15、plugin-runtime-prerequisites.md:46）
- ② 命中行含 rev：运行前提页那一行命中 1
- ③ hunk 级：我的改动为 @@ -12,0 +15 @@（1 行）与 @@ -41,0 +42,6 @@（6 行），纯增零删除
- 删除行归属点名：整页 3 处删除分别落 @@ -15 +18 @@ / @@ -22 +25 @@ / @@ -58 +62 @@，均为别的会话的行改写
- 返工卡链：t-b3071a（研发）与 t-f42ec3（复核）均 done，父卡 t-fcd6b0 done
- 上轮已过项（v1-1 / v1-3 / v1-4 / v1-5）不重验，本轮只重验 v1-2

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 两处入口回链（说明书索引 + 运行前提页机制一句） | ✓ 通过 | human/session-c9490164-89ba-491f-90ba-824aa5002549 | 2026-10-06 12:24 |
