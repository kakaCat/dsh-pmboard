# t-bf84df 契约与继承模块（端口三方法 + 标题递增 + 落定编排）·研发

> 需求：REQ-261005151245-54ae 开窗补齐继承：新窗口写入标题并继承源窗口模式与 LLM 模型

## 在做什么
契约与继承模块（端口三方法 + 标题递增 + 落定编排）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T07:27:23.260Z，窗口 session-30c79856-639c-4483-aed3-a49d3fc99546）

新窗口该继承什么、怎么算继承成功，现在有一份可跑的口径了：标题按「源标题 (1)」递增，模式与模型各自有 set/skipped/failed 三态，且「读不到」与「源没有」严格分开。

### 完成项

- 端口契约落地：WindowOpenerPort 加 readProfile / rename / selectModel 三个可选方法，WindowCreateOptions 加 agentPreset（与落点字段正交）
- 新增继承模块 window-inherit.ts（215 行，零 I/O）：increasedWindowTitle 与宿主 GUI 的递增口径逐字一致（半角与全角括号、大序号用 BigInt 不丢精度）
- readWindowProfile 永不抛：端口缺失与宿主抛错都收成 reason，空串与缺键一律按缺失
- presetInheritanceOf 三态纯函数：create 标明随请求带入、fork 标明由宿主继承、读不到记 failed
- applyWindowInheritance 三步不短路：标题写失败不影响模型继承，reasons 按「标题/模式/模型：原因」格式逐条给出
- 主用例集 tests/open-window-inherit.test.ts 建立（含 serves 头注），24 条用例覆盖标题递增、画像归一、三态、不短路、端口未装配五组

### 改动文件

- `src/application/ports.ts`
- `src/application/internal/window-inherit.ts`
- `tests/open-window-inherit.test.ts`

### 下一步

交复核子卡：请独立评审按 design/interfaces.md 与 design/data-model.md 核对实现与用例，重点看三态判定与文案规则是否与设计逐字一致、有没有漏掉的边界。

---
