# t-30dd7a 后台任务的户主改成身份证号：owner 口径收口·复核

> 需求：REQ-261002173819-69c7 修复 reqboard 自动化断链：Dive 无法重新武装 + 自动实施链投递失败

## 在做什么
后台任务的户主改成身份证号：owner 口径收口·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-02T10:03:25.895Z，窗口 session-c997b014-0c5c-4679-9439-98f6d0a3fc20）

复核结论：实现与设计的 owner 契约逐条一致、无功能性偏离；另如实登记三条非阻断事实（团队服务的同名字段、dive 管理器里的局部同名函数、diff 统计被同仓并发改动放大），避免下一个读者误读。

### 完成项

- 逐条核对 design/interfaces.md：owner 类型收紧、适配器零改动只透传、dispatchOwnerOf 只转出 agentIdOf、调用点改传 id —— 全部落位，无行为偏离
- 如实登记偏离一：验收措辞说 grep 只剩两处，实际还有 AgentTeamsAdapter.ts:94（那是团队服务的 owner，不是 JobsPort，非行为偏离）
- 如实登记偏离二：ReqboardDiveManager.ts:26 另有一份局部 agentIdOf（永不返回 undefined，只用于诊断与订阅键），未被本 FR 的 owner 口径使用
- 如实登记环境事实：本卡动过的三个源文件在 git diff --stat 上显示数百行，那是同仓其它窗口未提交的改动，本卡只占 owner 相关几处 hunk
- 复核结论：无功能性偏离，无需返工

### 下一步

测试子卡：跑本卡验收命令并留结论

---
