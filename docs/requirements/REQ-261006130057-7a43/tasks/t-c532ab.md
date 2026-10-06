# t-c532ab 壳：验收 Tab 注册 + Tab 栏/进度带收敛·复核

> 需求：REQ-261006130057-7a43 PM 插件需求详情页 UI 优化（原型先行）

## 在做什么
壳：验收 Tab 注册 + Tab 栏/进度带收敛·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T09:08:07.291Z，窗口 session-d71bdc25-ede6-48a2-a4ca-49637f67c9eb）

t2 复核完成：P1 红色待裁决徽标缺失已返工修复（含断言），P2×4 两条挂 t9 两条记录；主体（注册次序/禁 0/占位接缝/降级/缓存键/图标族/令牌纪律）全部核实通过。

### 完成项

- 对照原型 #FR-4/#FR-8 与 design §Tab 注册契约逐条核对：次序第 5 位、禁 0 冒充、占位接缝干净、404 降级、缓存键机制、图标族、令牌纪律、14 条新断言可失败——均过
- 发现 P1×1 已返工修复：验收 Tab 补红色待裁决徽标（buildTabBar 加 dsh-pm-badge-alert + data-badge-verify 锚；FR-4 块补红徽章规则从 --pm-danger 推导；补断言），修复后 14/14 绿
- P2-1 挂 t9：Tab 栏 overflow-x 横滚与探针 A3 的 900 档溢出需实测，溢出则 .dsh-pm-tabs 加 EXCEPTIONS
- P2-2 挂 t9：探针 INACTIVE_PANEL_KEYS 与截图脚本六图标口径还是旧 6 Tab 版
- P2-3 登记验收遗留：激活态 2px 指示条 design 有原型没有（保留指示条，原型补笔）
- P2-4 裁决不动：徽章胶囊底差异可接受
- 两条偏离裁决均可接受（无需改 store/board-mount 核实成立；旧探针硬断言挂 t9）

### 改动文件

- `src/client/views/report-tabs.ts`
- `src/client/styles/report.ts`
- `tests/report-tabs.test.ts`

### 下一步

t2 测试子卡：范围回归；另注意 t7 在途致树暂不可编译（其卡验收含 tsc 零错，完工时必修）

---
