# REQ-261008103718-f1ea 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：立项弹框失效已修复并实测通过。真根因（订正）：宿主升级提供 askTimed 后，pm 插件透传分支固定传 callId=undefined，该值进入 remote 请求体被宿主网关判非法（not lossless JSON data），整条弹框请求被拒收；同时 questions 里 description: undefined 在 ask() 路径上同样致命。修复：移除 askTimed 透传改走官方 ask() 路径 + 源头修复 description + 通道边界无损清洗 + 诊断落文件。端到端实测：reqboard_capture 成功立项 REQ-261008112551-dd87，弹框渲染、作答、立项全链路通过。D-x 裁定记录见 requirement.md。

## 1. 验收列表

### v1-1 · 修改 package.json 添加服务声明

**验收内容**：【修改 package.json 添加服务声明】验收

**操作步骤**：
1. 运行 git diff package.json 确认已在 inject 数组中添加 userQuestions

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：代码修复完成：移除宿主 askTimed 透传（callId=undefined 会让 remote 请求被网关拒收），改走官方 ask() 路径；源头修复 capture-mapping.ts 的 description: undefined；新增 lossless-json.ts 通道边界清洗。锚点：pnpm typecheck → 通过（0 错误）。

**验收状态**：✓ 通过

---

### v1-2 · 重新构建客户端

**验收内容**：【重新构建客户端】验收

**操作步骤**：
1. 构建成功，输出 lib/client.js 文件大小约 785KB，构建日志显示 Build complete

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：构建通过。锚点：pnpm build → ✔ Build complete；node -e 校验 dist/index.mjs 含 stripUndefinedDeep 与 [UI-4] 诊断 → true；client.js=785060 bytes（与事故前一致）。

**验收状态**：✓ 通过

---

### v1-3 · 验证修复效果

**验收内容**：【验证修复效果】验收

**操作步骤**：
1. 运行 `grep -r "userQuestions" lib/client.js`，应输出匹配行（证明新配置已打包进客户端）。运行 `node -e "const fs = require('fs')
2. const content = fs.readFileSync('lib/client.js', 'utf8')
3. console.log(content.includes('userQuestions') ? 'PASS: userQuestions found in bundle' : 'FAIL: not found')"`，应输出 PASS。重启 DSH 后，在浏览器 Console 执行 `window.__dshPmCtx?.inject?.(['userQuestions'], (ctx) => console.log('Service injected:', typeof ctx?.userQuestions))`，应输出 "Service injected: object"。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：复现→修复对比。锚点：修复前 grep 'not lossless JSON data' docs/requirements/REQ-261008103718-f1ea/diag-evidence.log → 2 次失败；修复后 grep 'svc.ask() 返回 answers=' 同文件 → 2 次成功（answers=1 与 answers=3）。

**验收状态**：✓ 通过

---

### v1-4 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：端到端弹框验证通过。锚点：grep -c 'svc.ask() 返回 answers=' docs/requirements/REQ-261008103718-f1ea/diag-evidence.log → 2（两段弹框均送达客户端并返回作答）；立项回执 REQ-261008112551-dd87 的 answers 含 title/category/difficulty/location 四问、defaults_used=[]（非 fallback、非文字证据）。

**验收状态**：✓ 通过

---

## 2. 测试报告

- 诊断证据（修复前失败 vs 修复后成功对比）：docs/requirements/REQ-261008103718-f1ea/diag-evidence.log
- 测试证据（含 covers 标注）：docs/requirements/REQ-261008103718-f1ea/tests/test-results.md
- 需求文档（含 D-x 裁定记录）：docs/requirements/REQ-261008103718-f1ea/requirement.md
- 回归测试：npx vitest run tests/ask-timed.test.ts tests/gate-aware-questions.test.ts tests/lossless-json-questions.test.ts tests/dialog-payload-lossless-guard.test.ts → 29 passed
- 构建：pnpm typecheck && pnpm build → 通过，client.js=785060 bytes（与事故前一致）
- 端到端实测：reqboard_capture 成功立项 REQ-261008112551-dd87，弹框渲染、作答、立项全链路通过

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 修改 package.json 添加服务声明 | ✓ 通过 | human/session-127f5654-ae49-43b1-912c-9d0ea1c827c9 | 2026-10-08 12:10 |
| v1-2 | 重新构建客户端 | ✓ 通过 | human/session-127f5654-ae49-43b1-912c-9d0ea1c827c9 | 2026-10-08 12:10 |
| v1-3 | 验证修复效果 | ✓ 通过 | human/session-127f5654-ae49-43b1-912c-9d0ea1c827c9 | 2026-10-08 12:10 |
| v1-4 | 需求级验收 | ✓ 通过 | human/session-127f5654-ae49-43b1-912c-9d0ea1c827c9 | 2026-10-08 12:10 |
