# t-ba8bd1 老行为可回退：开关、兼容与基线（迁移验证）·研发

> 需求：REQ-261004174324-4195 知识层自动自举：插件检测缺层即生成，并移除知识库页与侧栏入口

## 在做什么
老行为可回退：开关、兼容与基线（迁移验证）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T10:02:10.050Z，窗口 session-a1f04215-5a72-4eb9-8633-2259d055f3a3）

这一步做完，老行为可回退这件事有了实证：不写配置就自动补、写 false 就完全不动、整层关掉优先于自举。更重要的是，我在验证兼容时揪出一个真错误——按会话根自举时会把知识层写到插件自己的宿主目录而不是用户项目里，已改成按目标根取一个对应仓储，并加了断言锁住。

### 完成项

- 三态开关用例：不写配置→开启；autoBootstrap=false→目录零变化；enabled=false 优先
- 影子副本（含本仓真实知识层）自举 = skipped，全部产物内容与 mtime 不变
- 强制重算路径下手写页与 INDEX 手写行逐字保留
- 发现并修掉真缺口：会话根自举会写到宿主目录 → 协调器增加 docsFor(root) 根绑定仓储
- 证据两份在场：evidence/baseline.txt、evidence/kb-check.txt

### 改动文件

- `tests/kb-bootstrap-compat.test.ts`
- `src/application/internal/knowledge-bootstrap.ts`
- `src/index.ts`
- `docs/requirements/REQ-261004174324-4195/evidence/t6-compat.txt`
- `docs/requirements/REQ-261004174324-4195/evidence/kb-check.txt`

### 下一步

联调子卡：两种读根与回退路径实测。

---
