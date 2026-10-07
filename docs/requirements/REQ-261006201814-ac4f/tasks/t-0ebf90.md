# t-0ebf90 把「不是本次引入」变成可复核的集合差·复核

> 需求：REQ-261006201814-ac4f 测试反向与异常覆盖补强（错误码矩阵 / 红基线分诊 / hermetic 夹具）

## 在做什么
把「不是本次引入」变成可复核的集合差·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261006201814-ac4f/design/` 逐条核对；`npx vitest run tests/ab-attribution.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T07:31:16.338Z，窗口 session-13fffcba-1baf-45ca-92dc-3cd382ee51c8）

复核确认：A/B 产物 introduced 为空、stable 为真、fixed=3，判据可被四个合成反例反证

### 完成项

- 复核对象一：产物是否真的可复核——直接读 docs/reviews/REQ-261006201814-ac4f-ab.json：introduced 为空、fixed=3、repeatStability.stable=true、两侧各跑 2 次、files 与批一致
- 复核对象二：归因判据能否被反证——元测试用合成集合造真回归（introduced 非空）、无改动（空且 stable）、复跑不一致（stable 假）、空侧（响亮抛错）四个反例，全部实测
- 复核对象三：还原是否逐字节——还原通道只有 snapshotFiles/restoreFiles 一条路（内容 + sha256 双核），并有一例「快照被篡改后写回必须响亮失败」
- 复核对象四：真实 A/B 是否跑在正确的位置——测试进程写仓内被 ERR_ACCESS_DENIED 拦（实测），故真实 A/B 只能跑在 drill 里；这不是绕开守卫而是守卫生效的证据
- 复核发现：初版把 git 读数写在 worker 里会因权限模型拦 spawn 而静默返回空串，让判据恒真——本卡已把该读数移到 drill 并在代码注释里写明这一约束
- 复核发现：fixed=3 说明回退到改前形态确实**多**出 3 条失败，即这次共享夹具改动是真实的改进（不只是「没引入回归」）
- 复核结论：无偏离——introduced 为空、stable 为真、判据可被反证、还原逐字节，四项各有实跑证据

### 改动文件

- `docs/reviews/REQ-261006201814-ac4f-ab.json`
- `tests/helpers/ab-attribution.ts`
- `tests/ab-attribution.test.ts`

### 下一步

u12 收口把 A/B 产物纳入交付清单与读数文件

---
