# t-296efb RTM 引擎成包 reqboard-rtm·复核

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
RTM 引擎成包 reqboard-rtm·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261009174713-7bc8/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-09T10:55:15.549Z，窗口 session-5eb1ddb9-73cd-416a-96e8-99d4420cf11c）

分析：残留 3 处定性 + t1 哈希口径 bug 归因

### 完成项

- 残留 3 处均为引擎内部注释自述（非 import）；改它即违反引擎零改动，故保留并记入 t22 判据说明
- t1 哈希 bug 归因：hash.update(字符串) 默认 utf8，非 ASCII 文件被二次编码；已改按原始字节并重抓清单
- 口径结论：资产等价判据 = 内容哈希多重集相等 + 路径前缀映射，不按裸路径

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/reqboard-rtm/src`
- `.worktrees/req-261009174713-7bc8/src`
- `.worktrees/req-261009174713-7bc8/tests`
- `.worktrees/req-261009174713-7bc8/scripts/refactor-baseline.mts`

### 下一步

交复核子卡：等价性复核

---
