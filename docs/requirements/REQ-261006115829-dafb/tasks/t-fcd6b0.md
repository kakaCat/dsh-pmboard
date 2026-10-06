# t-fcd6b0 返工：两处入口回链（说明书索引 + 运行前提页机制一句）

> 需求：REQ-261006115829-dafb 排查 dsh-app://app/plugins/events 的 404/ERR_FAILED（重建重启竞态）

## 在做什么
返工：两处入口回链（说明书索引 + 运行前提页机制一句）

## 解决什么问题
承接自 任务 t-4c36ac；验收意见：需修改

## 得到什么结果
【两处入口回链（说明书索引 + 运行前提页机制一句）】验收：① grep -rn 'plugin-reload-troubleshooting' docs/architecture/ → 命中 ≥ 2 行，且分别落在 project-manual.md 与 plugin-runtime-prerequisites.md。② plugin-runtime-prerequisites.md 的命中行含 rev。③ 判据改为 hunk 级（2026-10-06 人裁定修订 v1-2）：git diff -U0 两页 | grep '^@@' → 属于本次交付的 hunk 不含以 - 开头的行（纯增）；整页若出现删除行，须能逐行点名归属到别的会话/别的需求（共享工作树下「整页 numstat 删除列为 0」不可能成立）。

---
## 汇报 1（2026-10-06T04:24:00.979Z，窗口 session-c9490164-89ba-491f-90ba-824aa5002549）

返工完成：判据口径按人裁定改为 hunk 级，卡片与用例表同步，复跑通过。

### 完成项

- 返工内容：v1-2 第三条判据由「整页 numstat 删除列为 0」改为 hunk 级「本次交付 hunk 纯增 + 删除行点名归属」
- 两处同步：卡上 acceptance（台账）与 design/test-cases.md 的 TC-2（文档）
- 复跑证据：入链 2 行分落两页；命中行含 rev；我的 hunk 为 @@ -12,0 +15 @@ 与 @@ -41,0 +42,6 @@ 纯增
- 归属点名：3 处删除分别落 @@ -15 +18 @@ / @@ -22 +25 @@ / @@ -58 +62 @@，属别的会话
- 子卡链两段收口：研发（t-b3071a）与复核（t-f42ec3）均 done
- 残留告知：verification 产物上带着上一轮误点的旧章，归档前会重新请人确认

### 改动文件

- `docs/requirements/REQ-261006115829-dafb/design/test-cases.md`

### 下一步

重提验收材料（v2 只含未过项 v1-2）

---
