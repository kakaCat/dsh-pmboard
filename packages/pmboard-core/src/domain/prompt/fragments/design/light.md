# 设计（design）· 轻档

> 设计阶段只写设计文档，不写计划（拆分归 decomposing）；轻档每份三行节即可，仍要落盘、仍要人确认。

- [ ] **目标**：一句话写清本需求在代码层面要达成什么（可证伪）。
- [ ] **设计**：改哪些文件/模块、接口与数据契约长什么样，讲清"怎么做"。
- [ ] **验收口径**：可执行的验收命令与期望输出（跑什么、看到什么算过）。
- [ ] **落盘**：写进 docs/requirements/REQ-xxxxxx/design/ 目录（文件名见类型模板；落盘后自动登记为
      design 产物；报"没有 kind=design 的产物"时看板打开需求详情触发登记再重试）。
- [ ] 下一步：decomposing —— 用 reqboard_ask_confirm(target=artifact, kind=design) 交棒；未获批准不得进入。

- [ ] 验收口径引用规范条目：先查 `reqboard_kb(kind='standard')`。
