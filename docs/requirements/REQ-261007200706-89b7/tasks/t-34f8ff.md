# t-34f8ff cordis.patch.yml 计数与 package.json monorepo 残留清理·研发

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
cordis.patch.yml 计数与 package.json monorepo 残留清理·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T13:48:45.494Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

研发子卡完成：cordis 计数不数数 + package.json repository 对齐真实 origin；build/typecheck 全过

### 完成项

- cordis.patch.yml:6 注释「于是 13 个 `reqboard_*` 工具与看板 HTTP 路由全部不注册」→「于是全部 `reqboard_*` 工具与看板 HTTP 路由全部不注册」（不数数，与 G2 同纪律）
- package.json repository：删 directory（agent-dh/packages/web/dsh-pmboard 旧 monorepo 残留）；url 由 git+https://github.com/kakaCat/pi-investment.git 改为 git+https://github.com/kakaCat/dsh-pmboard.git（与 git remote origin 一致）
- 判据 1：grep『13 个』cordis.patch.yml 零命中 ✔；判据 2：repository.directory 不存在、url = dsh-pmboard.git ✔；判据 3：pnpm build 退出码 0（host + client 产物齐、verify-client OK）、pnpm typecheck exit 0 ✔
- diff 极小：cordis.patch.yml 2 行（1 改 1 上下文）、package.json 5 行（-4/+1）——未触碰 scripts/依赖/其他字段

### 改动文件

- `cordis.patch.yml`
- `package.json`

### 下一步

复核子卡：核对两处残留与仓库真实身份

---
