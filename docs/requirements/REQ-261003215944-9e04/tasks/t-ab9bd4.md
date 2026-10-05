# t-ab9bd4 定义席位数据契约与读端折算·复核

> 需求：REQ-261003215944-9e04 DSH 会话分支驱动的 agent 自主立项与多窗口绑定（可行性）

## 在做什么
定义席位数据契约与读端折算·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-03T14:22:06.018Z，窗口 session-278681bb-b160-4067-8740-3d5a0f2c7426）

复核完毕：这一步的交付物对得上设计（席位契约 + 读端折算），没有越界改动，也没有偷偷降级——两条真实台账被读过之后字节不变，说明折算真的只发生在读的时候。唯一一处需要你知道的偏离：设计文档里席位入席时间写成了字符串，但同一条注释要求与全仓时间字段同形（毫秒数字），我按注释取的数字；这行文档建议订正，等你一句话我就改。

### 完成项

- 契约对账（design/data-model.md「席位结构 WindowSeat」）：字段与约束逐条核对通过——windowKey / role 三值 / lastSeenAt 可选；「owner 唯一」「owner 不可解绑」「上限 8」「同窗幂等」属 t2/t3 范围，本卡只落结构与折算，未越界
- 发现一处文档与实现的类型口径偏离并已按文档注释执行：data-model.md 的 joinedAt 字面写 string，但同行注释要求「与既有 record 字段同形」，而全仓时间字段（createdAt/lastActiveAt）都是 epoch ms 数字；实现取 number，未伪造 0（两侧都缺时直接返回空数组，不触碰该字段）
- 层边界复核：src/application/internal/window.ts 的 import 只有 domain/status、../ports、domain/requirement、shared/protocol，无外层依赖；跑 tests/layer-boundary.test.ts，越界清单里 9 个既有模块均不含 window.ts（grep 命中 0）
- 零回归证据复核：受控 A/B（备份→精确移除本卡新增→跑同一 46 个失败文件→还原并 shasum 校验）两侧均为 46 文件 / 98 用例失败，失败集合逐字相同；tsc 错误数两侧同为 150
- 只读性复核：两条真实台账（本需求与 REQ-261002175818-80a8）读数前后 shasum 逐字相等，且 seatsOf 对冻结入参不抛、不新增 seats 键
- 诚实性复核：seats 与 sourceSessionId 冲突时以 seats 为准、不静默改写；两者都缺返回空数组而非伪造 owner；未引入任何静默降级

### 改动文件

- `tests/seat-fold.test.ts`

### 下一步

两件需要人裁定的事已上报：① data-model.md 的 joinedAt 类型建议由 string 订正为 number（一行，语义未变，属已确认设计文档的笔误级订正，等批准后我改）；② 本树既有红基线（typecheck 150 错 / test 98 败）使计划 t14 的「四条命令退出码 0」不可达，建议另立清理卡或把该验收改为「相对基线不新增失败」。

---
