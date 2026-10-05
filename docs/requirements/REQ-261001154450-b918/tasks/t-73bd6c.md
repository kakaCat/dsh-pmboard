# t-73bd6c 收尾闭环可见：closingGap + 看板红标 + 下一步·复核

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
收尾闭环可见：closingGap + 看板红标 + 下一步·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

对照 docs/requirements/REQ-261001154450-b918/design/ 逐条核对；npx vitest run tests/closing-gap.test.ts → 全绿

## 汇报 1（2026-10-01T08:58:07.987Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

复核完成：按实测收敛——看板视觉面本就存在（REQ-9f4a44），本卡不重复造视觉，只做判据统一；"状态面覆盖已归档需求"经核实不成立（归档即解绑窗口），已按实测划掉。

### 完成项

- 复核完成：按实测收敛——看板视觉面本就存在（REQ-9f4a44），本卡不重复造视觉，只做判据统一；"状态面覆盖已归档需求"经核实不成立（归档即解绑窗口），已按实测划掉。

### 改动文件

- `src/domain/status/Predicates.ts`
- `src/application/internal/support.ts`
- `src/client/views/board.ts`
- `tests/closing-gap.test.ts`

---
