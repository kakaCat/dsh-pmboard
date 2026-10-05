# t-5e5f4d 面板新鲜度渲染：数据时间 / 失败红条 / 版本提示·研发

> 需求：REQ-261001124111-5d36 缺陷：需求详情 DAG 层级图不展示、泳道图不展示卡片

## 在做什么
面板新鲜度渲染：数据时间 / 失败红条 / 版本提示·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 `npx vitest run tests/panel-freshness-render.test.ts` → `Tests  10 passed`；再跑 `pnpm build:client 2>&1 | tail -1` → 输出含 `[verify-client] OK` 且列出 `dsh-pm-np-fresh` 等关键符号齐全。

## 汇报 1（2026-10-01T04:55:30.064Z，窗口 session-ee20d093-b61b-486e-96c2-e2a256ecea70）

这一步做完，什么变了：面板自己会报时间了——头上多一行「数据时间 HH:MM:SS」（超过 30 秒或从未成功会变警示色），刷新失败时多一条红字直说「显示的是几点几分的旧数据」；插件版本落后时多一条可点的「插件已更新」。三者都只在新入参下出现，不传就一个字都不变。

### 完成项

- src/client/node-panel.ts：NodePanelInput 加可选 freshness / buildNotice；renderHead 增「数据时间 HH:MM:SS」；新增 renderFreshnessBar() 渲染失败红条（role=alert）与版本提示（role=status + data-action=np-reload）
- src/client/styles/node-panel.ts：新增 4 个类（.dsh-pm-np-fresh / .is-stale / -fresh-err / -build-notice），色值全部取自本文件既有 token，不新增色值
- tests/panel-freshness-render.test.ts：9 例覆盖 TC-I…TC-M，npx vitest run tests/panel-freshness-render.test.ts → 9 passed
- 既有面板测试零改动通过：tests/node-panel.test.ts + tests/dag-view.test.ts → 71 passed（另一个 tests/node-panel-styles.test.ts 有 1 例失败，是别的窗口在途改了 width 规则导致，与本次改动无关，见 next_step）
- 变异自证两次：把红条改回「只有一无所有时才显示」→ TC-K 转红；去掉陈旧判定 → 2 例转红；还原后 9 绿

### 改动文件

- `src/client/node-panel.ts`
- `src/client/styles/node-panel.ts`
- `tests/panel-freshness-render.test.ts`

### 下一步

偏差（响亮报出）：tests/node-panel-styles.test.ts 断言面板宽度为 min(720px, calc(100vw - 130px))，而当前源码第 68 行已是 min(720px, calc(100% - 32px))——该行不是我改的（我只在文件末尾追加 4 个新类），属其它窗口在途改动导致的既有红。本卡以「新用例 9 绿 + 既有 node-panel/dag-view 71 绿 + 变异必红」为自身证据。下一步：t3 组件接线。

---
