# t-9db35a 绑定改写留痕+人工改绑入口（N-2）·研发

> 需求：REQ-261003222428-3556 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

## 在做什么
绑定改写留痕+人工改绑入口（N-2）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T16:36:50.285Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

t6 研发段完成：绑定改写有了唯一留痕入口——仓内改绑必留 actor/at/from/to，静态断言守新写入点（反向演练证成），看板「改绑到本窗口」只开人通道

### 完成项

- 写入点盘点：grep 全仓 src/ 无 `.sourceSessionId =` 直接赋值（改写确系仓外经存储层）；仓内写入点=创建绑定（support.ts:653，不动）+ 存储层透传
- 新增 binding-write.ts：applyRebind——store.mutate 内改绑+评论留痕（actor/at/from/to/reason），同窗口幂等零写入
- 看板改绑入口：POST /dashboard/api/reqboard/req/rebind——目标窗口必须在线（防制造新 N-1）、actor=human 留痕、幂等如实回执；agent 面不注册改绑工具（代码级拒绝=工具面不存在，与 armExplicit 同纪律）
- 新增 tests/binding-trace.test.ts 5 用例：留痕三形态 + 静态断言 + 无改绑工具/路由存在
- 反向演练证成：window.ts 临时注入一处 `.sourceSessionId = 'x'` → 静态断言红并点名 window.ts:192 → 还原绿
- 回归：tools-schema 绿、tsc 归属零错

### 改动文件

- `src/application/internal/binding-write.ts`
- `src/http/routers/requirements.ts`
- `src/http/routes.ts`
- `tests/binding-trace.test.ts`
- `docs/requirements/REQ-261003222428-3556/tasks/t-9db35a.md`

### 下一步

联调段（t-d4a122）：路由与存储/在线校验的对接

---
