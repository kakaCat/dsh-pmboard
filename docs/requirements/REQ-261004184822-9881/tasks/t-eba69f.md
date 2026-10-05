# t-eba69f 刷新别把人弹回去：把它接在重绘那两行上·测试

> 需求：REQ-261004184822-9881 看板泳道自动刷新导致浏览位置丢失

## 在做什么
刷新别把人弹回去：把它接在重绘那两行上·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-04T11:03:26.631Z，窗口 session-1c72e30b-075a-4375-a0e5-022885505cf8）

测试读数：接线接上后全量失败数仍是 98（未新增）、类型错误 153 低于基线 223 且与改动文件无关——这条改动站得住。

### 完成项

- pnpm test → 98 failed / 4412 passed（文档基线 106 failed；接线上线前后失败数同为 98，无新增失败）
- 新增与受影响用例：tests/board-lane-scroll.test.ts 11 passed、tests/board-attach.test.ts 9 passed、tests/board-entry.test.ts 7 passed、tests/board-focus.test.ts 5 passed
- npx tsc --noEmit → 153 个错误（基线 223，仍低于基线）；grep 确认其中没有一行来自本次改动的三个文件
- 错误集中在 tests/stage-prompts、tests/regenerate-chain 等既有测试（工作区里其它窗口的存量改动），与本次无关
- 失败要比对的是失败数：接线前后同为 98，结论是本卡未引入新失败

### 改动文件

- `src/client/board-mount.ts`
- `tests/board-lane-scroll.test.ts`

### 下一步

父卡收尾后接 t3（列高铺满）

---
