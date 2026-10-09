# t-afafc8 给层门补显式豁免面并落地空台账·研发

> 需求：REQ-261008020617-088f 层边界收口：15 处 application/ I/O 越界端口化 + 层门补豁免面

## 在做什么
给层门补显式豁免面并落地空台账·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/layer-boundary.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T18:53:11.915Z，窗口 session-914181c9-d280-4922-adc7-36cf2083f4ea）

研发段完成：豁免面四条判据落地、空台账就位，层门只剩边界外那条红。

### 完成项

- 新增 tests/fixtures/layer-boundary-exempt.json（_note 写清准入/清出/棘轮，frozenCount 0、entries 空）
- 层门加四条判据：双向相等 / 残量归零 / 理由 ≥20 字 / frozenCount 一致且 ≤ 硬上界 EXEMPT_CEILING=0
- 判据①抽成导出纯函数 unusedExemptions，并加合成输入用例（指向已修好文件 → 点名；都命中 → 不点名）
- 扫描抽成 violationsOf 共享函数；LAYER_RULES 定义与 HEAD 逐字节相同（md5 对照一致）

### 改动文件

- `tests/layer-boundary.test.ts`
- `tests/fixtures/layer-boundary-exempt.json`

### 下一步

复核段

---
