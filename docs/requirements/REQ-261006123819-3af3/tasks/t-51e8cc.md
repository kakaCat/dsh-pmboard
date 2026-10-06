# t-51e8cc 规范面改写口径并新增 C-28 提交判据·复核

> 需求：REQ-261006123819-3af3 审计优化·前 5 条落地（提交工作树 / 契约映射 / 基线口径 / 死字段 / 知识层自检）

## 在做什么
规范面改写口径并新增 C-28 提交判据·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T06:10:12.351Z，窗口 session-af0ee362-fa98-4396-a5d7-856681a42843）

复核段：C-14/C-15/C-28 契约与六条判据逐条核对；判据①的 kb-0025 属设计登记豁免，判据⑥按自述/历史面拆开如实登记。

### 完成项

- C-14 契约：四要素齐备（时机 提交前 / 命令 pnpm baseline:check / 期望含退出码锚点 / 基线指针 / 失败怎么办），与 interfaces.md 给的最终文案要点一致
- C-15 契约：同构，且保留了 - 基线： 行（K11 要求）
- C-28 契约：四要素齐备、命令为 pnpm commit:check --req <REQ-id>、期望含 OK 与退出码 0、失败怎么办含路径且无待补
- 判据①复核：规范性面（conventions / guides / architecture）命中 0
- 判据①偏差：kb-0025.md 2 处命中——设计在 interfaces.md 的例外表里已登记「决策记录，不追改」（改写历史证据＝篡改证据）
- 判据②复核：C-14/C-15 段落三位绝对数字 0 处；test-baseline.md 指针出现 2 次
- 判据③复核：kb-conventions-sync --check exit 0（覆盖 17 项 / 条目 18 / 零缺口零漂移）；K10、K11、K12 均绿
- 判据④复核：C-28 四要素与命令逐字核对通过
- 判据⑤复核：kb-conventions-c-28 在 INDEX 命中 1 次
- 判据⑥复核：docs/requirements/ 命中 120 处 = 本需求自述 9 处（判据原文自身）＋历史面 111 处（8 个带 REQ 日期的历史目录）

### 下一步

三条偏差待人工确认（见第二段），确认后关父卡 t-a9229c。

---
## 汇报 2（2026-10-06T06:10:16.940Z，窗口 session-af0ee362-fa98-4396-a5d7-856681a42843）

复核第二段：三条偏差（test 走 EXCLUDED、脚本登记口径、C-27 指针归属）逐条写明理由与否掉方案。

### 完成项

- 偏差一：pnpm test 未按内联骨架新增 C-29 条目，而是按仓内既有口径登记为 EXCLUDED（已由 C-14 的 baseline:check 内含）
- 理由：与 kb:build / kb:probe 被 kb:check 内含同款；新增条目会让同一件事有两个入口，也会多出一条 coverage 项
- 处置：sync --write 自动追加的 C-29 骨架与其带出的 c-29 索引行都已按此口径清掉，重跑后 --write 补 0 条
- 偏差二：卡上写把 test-baseline.mts / commit-check.mts 加进 EXTRA_ENTRIES；实际沿用既有 EXCLUDED 口径
- 理由：EXTRA_ENTRIES 会变成独立 coverage 项、还要求它自己的 C-NN 条目（等于记两遍）；且 test-baseline.mts 本就在 EXCLUDED（t-1f7453 已登记）
- 偏差三：C-27 的「失败怎么办」不在本卡补的（本需求知识层卡已补），且指向 C-16/C-17 而非卡上写的 C-17/C-23
- 理由：C-16「改了提示词片段必须重生成产物」正是 prompts:verify 失败的主因；C-23 与提示词无关
- 连带副作用（已登记）：改 operations.ts 推动符号表，kb-build --write 同时刷新了 code-map.md / code-map.symbols.tsv
- 未删断言、未放宽门禁：K11 的基线约束、K10 的四要素校验、K12 的完整性检查全部照原样生效

### 下一步

三条偏差建议人工确认；确认后关父卡。

---
