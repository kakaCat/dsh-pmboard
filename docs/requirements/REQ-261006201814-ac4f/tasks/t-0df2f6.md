# t-0df2f6 让判据不能自称在判：改坏必须变红·研发

> 需求：REQ-261006201814-ac4f 测试反向与异常覆盖补强（错误码矩阵 / 红基线分诊 / hermetic 夹具）

## 在做什么
让判据不能自称在判：改坏必须变红·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T07:30:51.723Z，窗口 session-13fffcba-1baf-45ca-92dc-3cd382ee51c8）

反向演练脚本落地：五条全部「改坏 → 必红 → 点名 → 逐字节还原」，退出码 0

### 完成项

- 新增 tests/drill/reverse-drill-error-codes.mts：五条演练（码矩阵断码 / 豁免棘轮 / 口径清单守卫 / 契约锚点 / 基线分诊），每条「改坏 → 判据必红 → 点名 → 逐字节还原」
- 纪律照抄既有 reverse-drill-matrix：文件级快照 + sha256 复核还原、禁用按路径检出还原、并发写入检测（文件不再是写入版本则放弃还原并响亮报错）、跑前目标存在性范围自检
- 支持 --json 与 --keep；还原后逐字节比对，任何一条没红、没点名或没还原都会让退出码非零
- 实测：npx tsx tests/drill/reverse-drill-error-codes.mts 退出码 0，五条全部 exit=1（必红）+ 有点名证据 + restored=true
- 反向演练后的目标文件 git status 无演练残留改动；harness 仍是改后形态（1 处绝对根、0 处句点）
- 另一条验收：把某条 target 改成不存在的路径 → 范围自检报错并退出码 1（实测）

### 改动文件

- `tests/drill/reverse-drill-error-codes.mts`

### 下一步

复核子卡核对五条演练的「点名证据」是否真的指向对应判据、还原是否逐字节

---
