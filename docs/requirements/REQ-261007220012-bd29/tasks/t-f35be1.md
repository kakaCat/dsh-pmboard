# t-f35be1 handoff/open_window schema 常量单源化（S6）·测试

> 需求：REQ-261007220012-bd29 reqboard 体检第三批工具面精简（27→21，S1~S6）

## 在做什么
handoff/open_window schema 常量单源化（S6）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-07T15:02:19.346Z，窗口 session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f）

S6 测试通过：两处单源读数=1，本卡零新增红，tsc 0 错误。

### 完成项

- 判据① 枚举唯一定义：grep -rn "['fork', 'create']" src/tools | wc -l = 1（shared.ts 的 WINDOW_MODES）
- 判据② inheritance 属性表唯一定义：grep "标题是否写定" src/tools = 1（shared.ts）
- 判据③ 指定三文件：open-window-tool 与 open-window-inherit 全绿；handoff.test.ts 2 例红为 REQBOARD_DEPENDENCY_GATE 既存失败（S1 基线已红，与本卡零交集）
- 判据④ 全量 pnpm test：38 failed files / 68 failed tests / 6948 passed；与 S5 差分新增 0，修好 error-code-inventory，settings-init 为既存 flaky
- tsc --noEmit error TS 计数 0

### 改动文件

- `docs/requirements/REQ-261007220012-bd29/evidence/t-06c363-s6.md`

---
