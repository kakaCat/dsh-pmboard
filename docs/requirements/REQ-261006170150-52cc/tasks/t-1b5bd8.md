# t-1b5bd8 契约文档与排查手册收口·复核

> 需求：REQ-261006170150-52cc 修复：弹框作答后不唤醒 agent（确认推进后静默停摆）

## 在做什么
契约文档与排查手册收口·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T10:50:07.447Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

复核文档收口：三处关键句可 grep、口径与实现一致、未动导出符号；kb-generate 的未达标已归因登记。

### 完成项

- acceptance ①：confirm-gate-advance 2 处、automation-chain-contract 2 处、project-manual 3 处命中关键句
- acceptance ③：手册新节含停机位语义、触发面（事件 + 清位回调）、排查三步
- 口径复核：文档措辞与实现一致（notify:false 理由 / 补发至多一次 / 分档 30-60 分钟 / 不新增投递路径）
- 导出符号未动 ⇒ kb:build 无需执行（本卡只改 docs/architecture/*.md）
- 偏离登记：acceptance ②（kb-generate 全绿）当前**未达标**——原因在别窗口 WIP 改了 src/domain/knowledge/generate.ts 与 docs/knowledge/code-map.*，与本卡文档改动无因果
- 该失败在本次改动**之前**的每一次全量读数里都已存在（属既有新增失败之一）

### 下一步

父卡 t-44966a 收尾

---
