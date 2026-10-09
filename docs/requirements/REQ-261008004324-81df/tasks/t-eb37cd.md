# t-eb37cd 清理打包树里的 Python 字节码产物·回归测试

> 需求：REQ-261008004324-81df reqboard 红测试收口：A 类夹具跟进 + C 类环境基线

## 在做什么
清理打包树里的 Python 字节码产物·回归测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 无新增失败（与基线比对，贴汇总输出）

---
## 汇报 1（2026-10-07T17:18:15.301Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

回归段：体积门转绿，真实 tarball 里 pycache/pyc 计数均为 0。

### 完成项

- npx vitest run tests/skills-assets.test.ts → Test Files 1 passed / Tests 8 passed
- pnpm 真实 tarball：pycache 计数 0、pyc 计数 0（155 个文件）
- 改前 pnpm tarball 为 pycache 3 条 ⇒ 泄漏已消除

### 改动文件

- `skills/ui-ux-pro-max/.npmignore`

---
