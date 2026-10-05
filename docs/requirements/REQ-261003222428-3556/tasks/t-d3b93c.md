# t-d3b93c 产物催办按 kind 聚合+成组确认（N-3）·测试

> 需求：REQ-261003222428-3556 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

## 在做什么
产物催办按 kind 聚合+成组确认（N-3）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-03T16:52:48.695Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

测试段完成：t7 判据全绿——聚合/成组/落章清单三件套落地，全量 97≤98 零新增

### 完成项

- 父卡验收命令：npx vitest run tests/artifact-gates.test.ts tests/pending-confirm-ttl.test.ts tests/artifact-group-confirm.test.ts → 全绿（含 design 成组既有用例零回归）
- 全量 pnpm test：97 failed ≤ 基线 98，本卡零新增失败（4 新用例在绿侧）
- npx tsc --noEmit：归属本卡文件（artifact-gates/node-input-package/ConfirmArtifact/AskConfirmTool/测试）零错
- 测试段结论：判据全部成立

### 改动文件

- `docs/requirements/REQ-261003222428-3556/tasks/t-d3b93c.md`

### 下一步

t7 父卡收尾；随后 t8 全量回归+契约文档摘缺口

---
