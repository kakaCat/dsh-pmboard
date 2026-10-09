# t-6c0ef3 cordis.patch.yml 计数与 package.json monorepo 残留清理·复核

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
cordis.patch.yml 计数与 package.json monorepo 残留清理·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007200706-89b7/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T13:49:00.085Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

复核通过：两处残留已清、根目录无其他同源残留、装载语义未动；无偏离

### 完成项

- 对照 design/architecture.md「FR-7 残留清理」逐条核对：① cordis.patch.yml 计数改不数数 ✔（原文「于是 13 个 reqboard_* 工具…」→「于是全部 reqboard_* 工具…」）；② package.json 删 repository.directory ✔；③ repository.url 对齐真实 origin（git remote -v = git@github.com:kakaCat/dsh-pmboard.git）✔
- 残留复查（超出判据的顺手核对）：package.json 其余元数据干净（name=dsh-pmboard、version=0.1.0、dsh.bundle.patch=./cordis.patch.yml、无 homepage/bugs 残留）；根目录文件 grep『pi-investment』『agent-dh/packages』零命中
- cordis.patch.yml 装载语义未动：只改注释一行，YAML 结构（- insert / id: pmboard / name: dsh-pmboard）逐字不变
- 判据复核：grep『13 个』零命中；python 读 repository 输出 False 与 git+https://github.com/kakaCat/dsh-pmboard.git；pnpm build exit 0（host+client 齐、verify-client OK）；pnpm typecheck exit 0
- 结论：无偏离

### 下一步

父卡 t-fed418 收尾并汇报

---
