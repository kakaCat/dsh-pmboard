# t-b8a3b7 文字证据确认推进改走单点·联调

> 需求：REQ-261007135258-331a 确认通道接线收敛：四条通道统一走「落章 + 推进 + 收尾」单点

## 在做什么
文字证据确认推进改走单点·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/confirm-evidence.test.ts tests/confirm-settle-preconditions.test.ts` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T06:16:51.194Z，窗口 session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1）

文字证据路径请求样例与期望响应逐项一致，advance 开关语义与回执形状保持不变。

### 完成项

- 文字证据路径回执键与改造前逐字一致（advanced / advanceNote / gate_failure 形状不变）
- advance:false 时回执 advanced=false 且台账状态不变（用例断言在场）
- 停手位被清、健康位复位断言在场
- confirm-evidence 8 例、confirm-settle-preconditions 6 例全绿

### 改动文件

- `src/application/use-cases/ConfirmArtifact.ts`
- `tests/confirm-evidence.test.ts`
- `tests/confirm-settle-preconditions.test.ts`

### 下一步

复核子卡：开关语义与失败路径

---
