# t-fed418 cordis.patch.yml 计数与 package.json monorepo 残留清理

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
cordis.patch.yml 计数与 package.json monorepo 残留清理

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
1) `grep "13 个" cordis.patch.yml` 零命中；2) `python3 -c "import json;r=json.load(open('package.json'))['repository'];print('directory' in r, r['url'])"` 输出 False 与 git+https://github.com/kakaCat/dsh-pmboard.git；3) `pnpm build && pnpm typecheck` 退出码 0

## 实施方案（implementation）
改 cordis.patch.yml:9 注释「13 个 reqboard_* 工具」→「全部 reqboard_* 工具」（不数数）；改 package.json：删 repository.directory（agent-dh/packages/web/dsh-pmboard 残留），repository.url 改为 git+https://github.com/kakaCat/dsh-pmboard.git（与 git remote origin 一致）

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T13:49:06.734Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

t8 完成：计数不数数 + monorepo 残留清理；三条判据全过

### 完成项

- cordis.patch.yml 注释「13 个 reqboard_* 工具」→「全部 reqboard_* 工具」（不数数）
- package.json：删 repository.directory 残留；repository.url 对齐真实 origin（dsh-pmboard.git）
- 判据 1 grep 零命中 ✔ / 判据 2 repository 输出 False 与正确 url ✔ / 判据 3 pnpm build 与 typecheck 均 exit 0 ✔
- 复核：根目录无其他 pi-investment / agent-dh/packages 同源残留；YAML 装载结构逐字未动
- 子卡链：研发 t-34f8ff done + 复核 t-6c0ef3 done

### 改动文件

- `cordis.patch.yml`
- `package.json`

### 下一步

t9（链尾总验收：四层等价证据 + 七组判据汇总复核）

---
