# t-adb83e 面板易变字段出注入字符串（稳定钩子 + 补丁）·复核

> 需求：REQ-261001210304-0dfb 修复会话节点面板 DAG 刷新即重置视图状态（滚动/方向/开关/页签）

## 在做什么
面板易变字段出注入字符串（稳定钩子 + 补丁）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-01T13:46:44.947Z，窗口 session-047f62a2-5b70-46df-b693-3b2e954f9aad）

t3 复核完毕：注入字符串里不再有任何随时间变化的值，补丁只改文本/属性、不插删元素；探针 B 段已从「两轮不同」翻转为「两轮逐字节相同」，仅一处轻微偏离（不给渲染函数加无用的 now 参数）并已记录理由。

### 完成项

- 对照 design/interfaces.md §3/§4 核对：稳定钩子与补丁函数签名（freshnessSpan() 无参 / hydrateFreshness(root,f) / relSlot(at) / hydrateRelTimes(root,now) / hydrateNodePanel(root,{freshness,tab,now})）与 DOM 契约（data-dsh-pm-fresh-slot / data-dsh-pm-rel）全部落地，无偏离
- 易变值核查：node-panel.ts 中 rel() 只在 hydrateRelTimes 内用于计算文本（注入字符串只放 data-dsh-pm-rel="<ts>"）；Date.now() 仅出现在 hydrateRelTimes 的缺省参数；新鲜度 span 不再携带任何时间戳
- DOM 安全核查：panel-freshness.ts / panel-hydrate.ts / node-panel.ts 中无 innerHTML 赋值、无 createElement/appendChild/removeChild（grep 命中项全部是注释里的说明文字）——补丁只改文本与属性，符合「不插删元素」
- 端到端信号（探针）：docs/.../evidence/probe-dag-reset.mts 的 B-1 断言 assert.notEqual 现在**失败**，即两轮（仅 fetchedAt 差 5 秒）renderNodePanel 输出已逐字节相同 = FR-3 达标；A 段断言仍通过（记忆回填尚未接线，属 t4 范围）
- 复跑 npx vitest run tests/panel-hydrate.test.ts tests/panel-freshness-render.test.ts → 22 passed；连带 node-panel/card-layer/stage-colors/stage-colors-e2e 共 76 passed
- 偏离与理由（唯一一处，轻微）：interfaces.md §3 提到「renderNodePanel 入参新增可选 now」，实现改为**不加**——相对时间已随 relSlot 移出渲染，渲染层不再读时钟，加一个死参数只会扩大 API 面；可注入时钟的需求由补丁层（hydrateRelTimes / hydrateNodePanel 的 now）满足，A3-2 用例已覆盖。调用方契约零变化

---
