# t-e8fb6d 更新 ATTRIBUTION.md 档案·复核

> 需求：REQ-261008143952-65dd 更新 vendor superpowers 分片到本地最新版

## 在做什么
更新 ATTRIBUTION.md 档案·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261008143952-65dd/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-08T10:42:50.476Z，窗口 session-d7422892-bcde-406a-a95e-3c0868cdd93c）

复核 t5：档案与上游 git 事实、盘上实测三方一致，14 行字节与行数全对，许可原文未动。

### 完成项

- 复核结论：无偏离
- 三方一致：上游 git commit/tag（8ca22dba…/v6.4.2）↔ 档案记录 ↔ 盘上文件，逐项相等
- 14 行的字节数与行数全部与 wc 实测相等（不只字节数）
- 许可原文段与 HEAD 逐字未变（25 行）
- 一处卡描述与实物不符已按实况处理：§3 原文并无 executing-plans 字节数，无可更新
- 预期红如实登记：prompt-tiers 的 ATTRIBUTION 断言仍钉 v6.3.0，属 t6

### 改动文件

- `src/domain/prompt/vendor/superpowers/ATTRIBUTION.md`

### 下一步

t6 更新 ATTRIBUTION 断言为 v6.4.2/8ca22dba 后该红消除。

---
