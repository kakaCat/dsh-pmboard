# t-0fea36 开窗落回源项目（适配器 + 两个用例调用点）·联调

> 需求：REQ-261004150249-731e 交接owner是什么意思

## 在做什么
开窗落回源项目（适配器 + 两个用例调用点）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-04T07:51:30.304Z，窗口 session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561）

联调段：新落点入参与既有开窗/立项调用方对接完成，旧夹具按新行为补齐且未弱化断言。

### 完成项

- 两个调用点（open_window / capture handoff）均带落点
- 旧调用方不传落点时请求体保持空对象（兼容）
- 既有契约测试 open-window-tool（7）/ capture-window-bound-policy（5）保持绿

### 改动文件

- `tests/open-window-tool.test.ts`
- `tests/capture-window-bound-policy.test.ts`

### 下一步

复核段

---
