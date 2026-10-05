# t-9fbf44 落知识层 pitfall 条目：DSH 席位静默退役判别法·复核

> 需求：REQ-261004095621-c167 定位并修复：模型选择器点击后消失（DSH 席位崩溃取证）

## 在做什么
落知识层 pitfall 条目：DSH 席位静默退役判别法·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T02:17:36.324Z，窗口 session-d649acde-c276-4061-88cd-a33f5142ef52）

复核通过：这条知识条目准确、能直接照做、指针可点开，索引与生成物自检全过。

### 完成项

- 复核结论：通过（kb-0022，判定依据四条）
- 准确性：三步判别法与本次实测证据逐条对应（inspect 的 active/registrant、控制台 slot entry crashed 原文、npm pack 对标）
- 可读性：结论段先说人话（控件点一下就消失=席位崩了被摘掉），术语只出现在解释里；one_liner 136 字符（≤140）、不含 ·/→
- 可核查：pointer 指向的 evidence/dsh-model-seat-crash.md 真实存在（7074 字节）；相关节引用的 project-manual.md 存在
- 索引合法：pnpm kb:check 的 K1/K2/K4/K5/K6 全过，条目与索引一一对应
- 复核发现（不影响通过）：docs/knowledge/ 整个目录未纳入 git 索引，故 git status 只显示为未跟踪目录；4 份生成物（code-map/符号表/令牌页/类名表）的重生成属规范 C-13 要求（此前源码改动留下的漂移），非范围蔓延

### 改动文件

- `docs/knowledge/entries/kb-0022.md`
- `docs/knowledge/INDEX.md`

---
