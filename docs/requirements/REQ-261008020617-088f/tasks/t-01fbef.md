# t-01fbef Dive Service 外壳外移到适配层·联调

> 需求：REQ-261008020617-088f 层边界收口：15 处 application/ I/O 越界端口化 + 层门补豁免面

## 在做什么
Dive Service 外壳外移到适配层·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/dive-wake-wiring.test.ts tests/dive-manager-wiring.test.ts tests/layer-boundary.test.ts` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T18:49:19.161Z，窗口 session-914181c9-d280-4922-adc7-36cf2083f4ea）

联调段完成：组合根装配与订阅接线在新路径下可达，application/ 真 import 越界为 0。

### 完成项

- 联调证据：dive-wake-wiring 10 用例绿（root 2 路 + per-agent 6 路订阅、失败留痕三者齐备）
- 联调证据：apply-wiring 7 用例绿（组合根 apply() 注册与 dispose 全链路在新路径下仍然成立）
- 联调证据：dive-manager-wiring 读新路径源码断言 6 用例绿（0 处 followup、Service 装配不变）
- 越界条数 0：application/ 已无 node: / @deepseek-ai/ 真 import（另 12 处命中经逐条核对全在文档注释里）

### 改动文件

- `src/adapters/ReqboardDiveManager.ts`
- `src/index.ts`

### 下一步

复核段

---
