# t-65cda7 open-doc 根解析诊断·复核

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
open-doc 根解析诊断·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007223647-da5d/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T16:16:31.231Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这一步做完，根来源读数有了明确的取值域与边界：需求级根命中就不下退，四种取值各有专测，且与设计枚举逐字对齐。

### 完成项

- IF-7 逐条核对：absolutizeDocPath 签名不变（返回 string，行为逐字兼容，用例逐场景对照）；peekLastRootSource 新增且只读不抛；docLocationHtml 的红字留给下一张卡 t-a429de（本卡只交读数）
- 取值域核对：req-root / session-root / server-root / none 四态齐，与设计 IF-7 的枚举一致
- 串会话核对：reqRoots[reqId] 命中时绝不退到会话根（用例专测），根选择顺序与改造前完全一致
- 偏离说明（如实记录）：新增 absolutizeDocPathWithSource 作为解析逻辑的唯一实现（IF-7 未列）——理由：UI 需要「地址 + 来源」同源得出，若先调 absolutize 再回头猜，中间任何一次别的解析都会污染读数；absolutizeDocPath 保持为薄壳，签名与行为不变
- 命令：npx vitest run tests/open-doc-root-source.test.ts tests/doc-location-panel.test.ts → 19 例全绿

### 改动文件

- `src/client/open-doc.ts`

### 下一步

测试段：跑本卡相关测试集并留命令与输出摘要

---
