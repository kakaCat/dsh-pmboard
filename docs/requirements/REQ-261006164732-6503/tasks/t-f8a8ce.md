# t-f8a8ce 落盘迁移 / 兼容 / 回滚清单·研发

> 需求：REQ-261006164732-6503 拆分阶段批准门重复弹框：自动弹框与 agent 显式弹框并存并覆写审批台账

## 在做什么
落盘迁移 / 兼容 / 回滚清单·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T10:34:32.977Z，窗口 session-d210345f-6bd2-4a05-be59-e859c70b86c5）

研发段完成：迁移/兼容/回滚清单落盘，四节各有依据指向；返回键零新增有 42 例为证。

### 完成项

- notes/migration-rollback.md 四节齐备：零 schema 变更依据 / 旧调用方核对 / 回滚步骤 / 历史覆写记录阅读口径
- 每节带依据指向：设计 G-1/G-5、interfaces.md I-3/I-6/I-8、具体用例文件与键集断言
- 零 schema 变更的三条依据：不碰数据库、门是进程内结构、台账字段未新增
- 旧调用方核对列出唯一破坏性面：PendingConfirmPort 新增必选成员 findOpen（实现者只有 PendingConfirmRegistry，测试 fake 已同步）
- 回滚步骤给可直接粘贴的命令（含提示词产物重生成，避免 C-17 校验红）
- 证据：npx vitest run tests/output-contract.test.ts → 42 例全绿（返回键零新增）

### 改动文件

- `docs/requirements/REQ-261006164732-6503/notes/migration-rollback.md`

### 下一步

复核段：核对清单每节依据是否真实成立。

---
