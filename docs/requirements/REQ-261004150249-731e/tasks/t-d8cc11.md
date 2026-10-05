# t-d8cc11 开窗落回源项目（适配器 + 两个用例调用点）·研发

> 需求：REQ-261004150249-731e 交接owner是什么意思

## 在做什么
开窗落回源项目（适配器 + 两个用例调用点）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T07:51:25.364Z，窗口 session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561）

研发段落地：新会话可以指定落在源会话所属项目（优先项目、其次目录），拿不到就不建，绝不悄悄落到宿主目录。

### 完成项

- create(opts?) 组装宿主请求：workspaceId 优先、cwd 兜底、都不给时保持既有空请求
- 新增 resolveSourceProject：经工作区注册表解析源会话所属项目
- OpenWindow 用例与 capture 的 handoff 分支共用同一落点解析（三级）
- 解析不出 → 响亮失败且不建会话

### 改动文件

- `src/adapters/SessionWindowOpener.ts`
- `src/application/use-cases/OpenWindow.ts`
- `src/application/use-cases/CaptureRequirement.ts`
- `tests/open-window-project-root.test.ts`

### 下一步

联调段：与既有开窗/立项调用方对接

---
