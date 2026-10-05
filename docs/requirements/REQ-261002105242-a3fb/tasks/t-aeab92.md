# t-aeab92 详情页终态只读：archived / canceled / done 恒不渲染操作条·复核

> 需求：REQ-261002105242-a3fb 归档需求在看板失去入口：恢复「已归档」区，让历史需求的 DAG/任务仍可查看

## 在做什么
详情页终态只读：archived / canceled / done 恒不渲染操作条·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-02T03:02:10.291Z，窗口 session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec）

复核结论：终态只读口径与 interfaces.md §4 无偏离；顺手定位出一条与本次改动无关的既有红（会话导航「暂不可用」文案断言过期，HEAD 上就红），不掩盖、不借修。

### 完成项

- 对照 interfaces.md §4 的终态表：archived / canceled / done 三态恒为 ''，其余在途态（draft…accepting）按钮、计划裁决、验收裁决全部保留——逐条对上
- 核对只读面仍在：A3 用例同时断言状态胶囊与 8 态进度点照常渲染（只读 ≠ 空白）
- 跑 npx vitest run tests/archived-entry.test.ts：A3 三例绿；同文件 A5 两例红属 t4 归属
- 跑 tests/board-info-fixes.test.ts 发现两处红并逐一定性：①「已完成且材料已备→给 archive-req」是 t4 的翻转对象（预期）；②「jumpResultMessage 不可用文案」与本卡无关——已核实 HEAD 版本就没有「暂不可用」字样（git show HEAD:src/client/board-mount.ts:139），属既有基线红，不修、不改判据，如实上报

### 改动文件

- `src/client/views/stage-detail.ts`
- `tests/archived-entry.test.ts`

### 下一步

t4 翻转 board-info-fixes 的 archive-req 用例并清理僵尸入口

---
