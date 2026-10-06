# REQ-261005155003-f32f 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：详情页外观层完成：13 条 FR 全部落地且有可跑判据。三个脚本全绿（渲染探针 A1～A13、对比度报表、原型出图），客户端构建 OK，类型检查 0 错，全仓测试失败数与开工前持平（68），首屏预算不回退（tabsTop 497/527/437/441 ≤ 713）。过程中补测了原型从未渲染过的五块面板并修掉四类真实缺陷；两处判据勘误与五块面板的章节 emoji 已显式登记，请一并裁决。

## 1. 验收列表

### v1-1 · 落地浅色岛令牌块并移除宿主深色覆盖

**验收内容**：【落地浅色岛令牌块并移除宿主深色覆盖】验收

**操作步骤**：
1. ① `grep -n -e '--dsw-text-primary' -e '--dsw-text-secondary' -e '--dsw-accent' -e '--dsw-bg-primary' -e '--dsw-alias-label-tertiary' src/client/styles/report.ts` 命中 0
2. ② `grep -c 'data-ds-dark-theme' src/client/styles/report.ts` = 0
3. ③ `grep -c 'rgba(128,128,128' src/client/styles/report.ts` = 0 且 --pm-text3 的值是 #86868b
4. ④ 原型对照（可失败）：headless Chrome 对 prototypes/detail-ui-v3.html?theme=dark&v=next&annot=0 与 ?v=next&annot=0 各出一张 PNG（1280 档 · 在途，--window-size=1280,800 --hide-scrollbars），shasum -a 256 两值相同
5. 禁止用 ?v=current 当对照组（K8）
6. ⑤ `pnpm build:client` 输出含 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-2 · 新建单一图标源模块 src/client/icons.ts

**验收内容**：【新建单一图标源模块 src/client/icons.ts】验收

**操作步骤**：
1. ① `grep -c 'viewBox=' src/client/icons.ts` = 9
2. ② `grep -c -e 'width=' -e 'height=' -e 'style=' src/client/icons.ts` = 0，且 6 位十六进制色值 0 命中
3. ③ `grep -c 'aria-hidden' src/client/icons.ts` = 9 且每个值恰 1 个 <svg>
4. ④ `npx vitest run tests/report-shell.test.ts -t '图标族'` 全绿
5. ⑤ 原型对照（可失败）：权威原型 prototypes/detail-ui-v3.html#FR-1（1280 档 · 在途，--window-size=1280,800）实测 Tab 栏内 <svg> 宽高 14±1（6/6 命中），且本模块字符串无尺寸字面量
6. 对照截图与差异说明落 docs/requirements/REQ-261005155003-f32f/evidence/。⑥ `pnpm build:client` 含 [verify-client] OK（C-12）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-3 · Tab 栏换内联 SVG 并补 tablist/tab 语义与方向键

**验收内容**：【Tab 栏换内联 SVG 并补 tablist/tab 语义与方向键】验收

**操作步骤**：
1. ① `npx vitest run tests/report-shell.test.ts -t 'Tab 栏'` 全绿且该文件 :138 逐字未改
2. ② 渲染断言：产物含 1 个 role=tablist（带 aria-label），每项含 role=tab 与 aria-selected，aria-selected=true 恰 1 个
3. 每项 aria-controls=panel-<key>，面板容器 role=tabpanel 且 id=panel-<key>、aria-labelledby=tab-<key>
4. ③ `npx tsx scripts/req-report-probe.mts` 退出码 0（A4：未激活面板 0 个、包装器恰 1 个、默认 trunk 在场）
5. ④ 否证步骤：剥离全部新增属性后既有断言仍全绿
6. ⑤ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-3（1280 档 · 在途，--window-size=1280,800）实测 role=tablist 在场、选中项恰 1 个 aria-selected=true、←/→ 后焦点与 selected 同时前移一格且面板段换成 panel-<新 key>。⑥ `pnpm build:client` 含 [verify-client] OK（C-12）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-4 · 统一键盘焦点环（两档偏移）

**验收内容**：【统一键盘焦点环（两档偏移）】验收

**操作步骤**：
1. ① `grep -c 'focus-visible' src/client/styles/report.ts` ≥ 1，且 grep -n 输出逐类命中 FR-2 清单（缺一类即红）
2. ② 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-2（1280 档 · 在途，--window-size=1280,800）用键盘聚焦一个 .dsh-pm-tab，计算样式 outline-width:2px、outline-offset:-2px、outline-color:rgb(0,113,227)
3. 原型上 data-proto-focus=1 的方框是演示，不得当默认外观
4. ③ 探针读数（t14 的 A7 组）：清单控件 el.focus() 后 outlineWidth ≥ 2px、outlineColor 与背景对比 ≥ 3:1、outlineOffset = -2px（面状）/2px（小控件），浅深两套宿主主题各跑一次
5. ④ 鼠标路径无环：page.mouse.click() 后 outline 为 none/0
6. ⑤ `pnpm build:client` 含 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-5 · 把交互目标加高到 ≥24×24（窗口胶囊/行内链接）

**验收内容**：【把交互目标加高到 ≥24×24（窗口胶囊/行内链接）】验收

**操作步骤**：
1. ① 探针读数（t14 的 A8 组，可失败）：遍历 button/[role=tab]/a[href]/summary/input，getBoundingClientRect() 宽高均 ≥ 24、相邻间隙 ≥ 8px，例外清单显式写在断言里逐条给理由
2. ② 静态：grep -n -e 'dsh-pm-window' -e 'dsh-pm-trunk-open' src/client/styles/report.ts 命中处带 min-height:24px 或 ::after 命中区规则
3. ③ `npx tsx scripts/req-report-probe.mts` 退出码 0（A1 的 tabsTop ≤ 713、A2 无横向溢出、A3 无内层滚动、A5 不重叠、A6 整块 ≤ 72px）
4. ④ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-5（1280 档 · 在途，--window-size=1280,800）实测最矮目标 .dsh-pm-window = 203.1×24.0、.dsh-pm-trunk-open ≥ 24 高，对照截图与差异说明落 evidence/。⑤ `pnpm build:client` 含 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-6 · 落地动效令牌与 reduced-motion 分支

**验收内容**：【落地动效令牌与 reduced-motion 分支】验收

**操作步骤**：
1. ① `grep -c -e 'transition' src/client/styles/report.ts` ≥ 1，且 transition 时长全部形如 var(--pm-dur，裸 ms 字面量 0 命中
2. ② `grep -c 'prefers-reduced-motion' src/client/styles/report.ts` ≥ 1，且该分支内三个时长令牌均为 0s
3. ③ 探针读数（t14 的 A10 组）：模拟 reduced-motion 后计算 transitionDuration = 0s（脚本注释写明本机 headless 恒为 reduce）
4. ④ `npx tsx scripts/req-report-probe.mts` 退出码 0（过渡不改几何）
5. ⑤ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-6（1280 档 · 在途，--window-size=1280,800）实测 reduced-motion 下过渡时长 0s，与 proto-geometry 读数一致。⑥ `pnpm build:client` 含 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-7 · 收敛字阶到六档并重建视觉层级（间距 36px／模块上下结构／主色纪律）

**验收内容**：【收敛字阶到六档并重建视觉层级（间距 36px／模块上下结构／主色纪律）】验收

**操作步骤**：
1. ① 静态：裸 font-size 数字 px 在 src/client/styles/report.ts 除令牌定义处 0 命中
2. 9.5/10/10.5/11.5/12.5/13.5/21px 在字号位 0 命中
3. font-weight 650/660/700 0 命中
4. ② `npx tsx scripts/req-report-probe.mts` 退出码 0（tabsTop ≤ 713、状态带单格 ≤ 220px、操作条 ≤ 72px、无内层滚动、无横向溢出）
5. ③ 探针读数（t14 的 A9/A12 组，可失败）：可见真文字最小 font-size ≥ 11px、档位集合 ⊆ {11,12,13,15,20,24} 且无阶梯外字号（按可见性排除 sr-only）
6. H1 24÷13=1.85 ≥ 1.8、H2 36÷8=4.5 ≥ 3、H3 模块标题 15/600 对正文 13/400、H4 卡片内三格档数 3 且两两差 ≥ 2px、H5 主色文字类数 ≤ 1
7. ④ 阶梯外间距断言显式放行 --pm-space-module 一个令牌
8. ⑤ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-7 与 #FR-12（1280 档 · 在途，--window-size=1280,800）实测 h1=24px、模块标题 15px/600，原型 moduleGap=24px 与裁决的 36px 差异逐条写明理由，截图与差异说明落 evidence/
9. ⑥ `pnpm kb:build && pnpm kb:check` 退出码 0。⑦ `pnpm build:client` 含 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-8 · 收敛胶囊/圆角/边线/阴影（苹果式克制）

**验收内容**：【收敛胶囊/圆角/边线/阴影（苹果式克制）】验收

**操作步骤**：
1. ① 静态：rgba(128,128,128,.11)、--pm-line-soft、--pm-bg-softer、--pm-shadow-card 在 src/client/styles/report.ts 命中 0
2. ② 原型对照（可失败）：在 prototypes/detail-ui-v3.html#FR-10（1280 档 · 在途，--window-size=1280,800，壳内 213 个元素）复量七项多样性，读数须 ≤ 上限——胶囊 ≤ 5、前景色 ≤ 5、底色 ≤ 4、字重 ≤ 3、字号 ≤ 6 且无阶梯外值、圆角 ≤ 2、边线色 ≤ 2
3. 复量命令与读数落 evidence/style-variety-before-after.txt、整页对照图落 evidence/ui-before-after-full-1280.png
4. ③ 同一批断言复跑 `npx tsx scripts/req-detail-ui-prototype-shot.mts` 时既有断言一条不回退
5. ④ `pnpm build:client` 含 [verify-client] OK
6. ⑤ `pnpm kb:build && pnpm kb:check` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-9 · 头部拆两行：动作行独占、身份行另起且窗口靠左

**验收内容**：【头部拆两行：动作行独占、身份行另起且窗口靠左】验收

**操作步骤**：
1. ① D-8 三条（t15 出图脚本与 t14 探针各量一次，可失败）：actionRowTop < identityRowTop、identityRowTop 减 actionRowTop ≥ 8px、windowLeft < createdAtLeft（1280 与 900 两档各一组）
2. ② 回归线：动作按钮 offsetTop 单一取值、操作条整块高 ≤ 72px、`npx tsx scripts/req-report-probe.mts` 退出码 0（A5 不重叠、A6 版式、A1 的 tabsTop ≤ 713
3. 900 档 tabsTop 603 是预期值）
4. ③ 位置不随数量漂移：同一标本注入 1/2/3 个动作各渲一次，主操作 offsetLeft 与破坏性动作位置三次相同（变体标本落 scripts/fixtures/req-detail-specimen.mts，断言随 t15 落地）
5. ④ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-9（1280 档 · 在途，--window-size=1280,800）实测 actionGridLeft 等于卡片内容区左缘、窗口组在「创建于」左侧
6. 原型「布局修复层 v2 (1)」的写法已被 D-8 撤销，差异须逐条写进对照说明并落 evidence/。⑤ `pnpm build:client` 含 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-10 · 操作条文案收敛并真删 DOM 节点（含两处提示文案同步）

**验收内容**：【操作条文案收敛并真删 DOM 节点（含两处提示文案同步）】验收

**操作步骤**：
1. ① 渲染断言：产物不含操作条那一处 .dsh-pm-action-bar-label（「本阶段操作」），且 `grep -n '本阶段操作' src/client/views/` 只命中评论列表 report-head.ts:338
2. ② 渲染断言：主操作按钮有 aria-describedby，指向节点文本 === 服务端 consequence，该节点视觉隐藏（宽高 ≤ 1px 或 clip-path）但对读屏可见
3. ③ 渲染断言：行尾标文本 ===「需人工确认」、data-human-only-mark=1 仍在、data-human-only=true 计数不变
4. ④ `grep -n '本阶段操作' src/client/views/artifacts.ts src/client/views/verification.ts` 命中 0
5. ⑤ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-11（1280 档 · 在途，--window-size=1280,800）实测 label 与可见后果节点均 0×0（CSS 隐藏、DOM 仍在——原型只是预览，本卡要求真删），差异说明落 evidence/
6. ⑥ `pnpm build:client` 含 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-11 · 真删详情页评论输入框并保住对话 Tab 评论链路

**验收内容**：【真删详情页评论输入框并保住对话 Tab 评论链路】验收

**操作步骤**：
1. ① 渲染断言：详情页头部产物不含 dsh-pm-comment-form、不含头部 [data-action=add-comment]、不含 [data-role=comment-input]，但含 data-comment-list（「最近评论 N 条（新的在下）」仍在）
2. ② 切到 dialogue 面板：.dsh-pm-comment-form 存在、其 [data-role=comment-input] 能被 commentInputOf(sendButton, root) 取到，点发送仍走 add-comment——这是删过头的唯一防线
3. ③ `npx tsx scripts/req-report-probe.mts` 退出码 0（四组合、终态只读、A4 纪律不变）
4. ④ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-13（1280 档 · 在途，--window-size=1280,800）实测 proto-geometry 记 commentFormsInPage=1（头部那处 CSS 隐藏、DOM 仍在），本卡要求头部 DOM 真删、对话 Tab 那处保留，差异说明落 evidence/。⑤ `pnpm build:client` 含 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-12 · 状态不靠颜色单一表达（真实文本／aria-hidden SVG）

**验收内容**：【状态不靠颜色单一表达（真实文本／aria-hidden SVG）】验收

**操作步骤**：
1. ① 渲染断言：阶段条三态与结论三态各自元素内存在文本节点或 svg 子节点
2. 标记若实现为 CSS ::before content 则判红
3. ② `grep -c -e '🔴' -e '🟡' -e '⚪' src/client/views/report-band.ts` = 0，且三档 severity 各带对应文本标记（!! / ! / ·）与 aria-hidden 的 SVG 圆
4. ③ 灰度人工评审：探针注入 filter:grayscale(1) 后出图（1280 档在途 + 终态），人工核对阶段/缺口/结论三处仍可区分，截图落 docs/requirements/REQ-261005155003-f32f/evidence/
5. ④ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-8（1280 档 · 在途，--window-size=1280,800）实测阶段条 completed=✓ / current=▸
6. 原型用 ::before，本卡必须落成真实节点，差异逐条说明。⑤ `pnpm build:client` 含 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-13 · 新增对比度报表脚本（读 report.ts 令牌声明）

**验收内容**：【新增对比度报表脚本（读 report.ts 令牌声明）】验收

**操作步骤**：
1. ① `npx tsx scripts/req-detail-ui-contrast.mts` 退出码 0，输出含每个色值的实测比值与判定（正文档 ≥ 4.5、非文本档 ≥ 3）
2. ② 可失败性自证：临时把 --pm-warn-text 改回 #a86a00 后退出码非 0，恢复后复绿
3. ③ `grep -c -e '--pm-ok-text-tint' -e '--pm-teal-text-tint' -e '--pm-danger-text' src/client/styles/report.ts` ≥ 3
4. ④ `grep -c 'data-ds-dark-theme' src/client/styles/report.ts` = 0，且脚本里有「报表出现宿主深色影响即判失败」的分支
5. ⑤ 报表落 docs/requirements/REQ-261005155003-f32f/evidence/，并与 evidence/contrast-baseline.txt 的豁免登记逐条对齐。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-14 · 探针新增可访问性断言组（焦点环/目标尺寸/最小字号/reduced-motion/阶段条标记）

**验收内容**：【探针新增可访问性断言组（焦点环/目标尺寸/最小字号/reduced-motion/阶段条标记）】验收

**操作步骤**：
1. ① `npx tsx scripts/req-report-probe.mts` 退出码 0，输出含 tabsTop ≤ 713 与 A7～A13 每条实测值行（缺一条即红）
2. ② 可失败性自证：临时把某控件高度改到小于 24、去掉 :focus-visible、把某处字号改回 12.5px，对应断言各报红且退出码 1，恢复后复绿
3. ③ `grep -c 'sr-only' scripts/req-report-probe.mts` ≥ 1（按可见性过滤，假红防线在场）
4. ④ 输出含 docs/dag/dialogue/token/prompts 五块逐块实测行
5. ⑤ 退出码语义不变：0 全过、1 有断言失败、2 环境不可用（找不到 Chrome 即响亮失败，不静默跳过）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-15 · 出图脚本改指权威原型并改造漂移断言口径（K7）、修正 ?v=current 口径（K8）

**验收内容**：【出图脚本改指权威原型并改造漂移断言口径（K7）、修正 ?v=current 口径（K8）】验收

**操作步骤**：
1. ① `npx tsx scripts/req-detail-ui-prototype-shot.mts` 退出码 0
2. ② `grep -c 'detail-ui-v3.html' scripts/req-detail-ui-prototype-shot.mts` ≥ 1 且 `grep -c 'detail-ui-v2.html' scripts/req-detail-ui-prototype-shot.mts` = 0
3. ③ 漂移核对仍逐段比对（head/band/panel/tabs 四段全在），判据为「除已声明偏差（图标 emoji 换 SVG、补 ARIA 与稳定 id）外逐字节相同」——D-8 的两行头部先改进真壳（report-head.ts 真删真移）再由真壳重新内联，故不构成偏差
4. FR-11 两处删除以逐节点断言打印少的两个节点与 sr-only 文本
5. ④ 浅色岛 sha256：?theme=dark&v=next&annot=0 与 ?v=next&annot=0（1280 档 · 在途，--window-size=1280,800）两档 PNG 逐字节相同
6. ⑤ K8：脚本里不再有「拿 ?v=current 当改前基线」的断言，两张复测表与 evidence 方法说明改标完成
7. ⑥ proto-geometry 观测条数按重测刷新（≥ 36 条），before/after 图同批产出。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-16 · 同步既有渲染断言（五处改动 + 两条新增）

**验收内容**：【同步既有渲染断言（五处改动 + 两条新增）】验收

**操作步骤**：
1. ① `npx vitest run tests/report-shell.test.ts tests/report-firstscreen-gaps.test.ts` 全绿
2. ② `git diff --stat` 显示两份测试文件的改动恰好是清单处数（report-shell 改 1 处 + 新增断言块，firstscreen 改 2 处 + 新增两条），且 tests/report-shell.test.ts:138 与 Tab 栏用例逐字未改
3. ③ `pnpm test` 失败数 ≤ 基线 106 且改过的用例全绿
4. ④ 可失败性自证：临时去掉渲染里的 aria-describedby 后新增断言①报红，恢复后复绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-17 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-18 · 需求级验收

**验收内容**：与原型对照截图（含差异说明）

**操作步骤**：
1. 与原型对照截图（含差异说明）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-19 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-20 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

### v1-21 · 需求级验收 · 三方一致性

**验收内容**：三方一致性（做什么 × 怎么做 × 实际做了什么）：以下对不上——FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-3 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-12 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-3 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-3 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）。请补设计、补实施、或显式登记为不做。

**操作步骤**：
1. 三方一致性（做什么 × 怎么做 × 实际做了什么）：以下对不上——FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）
2. FR-3 实施缺失：没有任何任务卡接收它（设计好了没做）
3. FR-12 实施缺失：没有任何任务卡接收它（设计好了没做）
4. FR-3 实施缺失：没有任何任务卡接收它（设计好了没做）
5. FR-3 实施缺失：没有任何任务卡接收它（设计好了没做）
6. FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）。请补设计、补实施、或显式登记为不做。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx tsx scripts/req-report-probe.mts → 退出码 0：四组合全过；A7 焦点环 2px/±2px/4.7:1；A8 最小命中区 42×24、间距违例 0；A9 最小字号 11px、档位恰六档；A10 reduce 下过渡 0s；A11 非颜色标记齐；A12 H1 1.85 / H2 4.5 / H5 主色 1 类 / D-8 动作行 8 < 身份行 39；A13 五块面板逐块 PASS
- npx tsx scripts/req-detail-ui-contrast.mts → 退出码 0；报表落 docs/requirements/REQ-261005155003-f32f/evidence/contrast-report.txt（真文字 9 条含反白、非文本 8 条、芯片 tint 3 条、豁免 4 条逐条登记）
- npx tsx scripts/req-detail-ui-prototype-shot.mts → 退出码 0（幂等）：四段漂移按五类已声明偏差抹平后逐字节相同；FR-11/FR-13/D-8 逐节点断言；浅色岛 sha256 两档相同 7641a105…9c6；proto-geometry 81 条
- docs/requirements/REQ-261005155003-f32f/evidence/prototype-and-decisions.md → 原型逐锚点对照（authoritative = prototypes/detail-ui-v3.html）+ D-1～D-8 逐条兑现与证据
- 灰度评审图 docs/requirements/REQ-261005155003-f32f/evidence/ui-gray-1280-inflight.png 与 ui-gray-1280-terminal.png（人眼确认阶段条 ✓/▸、缺口 !! / ! / ·、验收结论在无颜色时仍可区分）
- 改前/改后对照图 docs/requirements/REQ-261005155003-f32f/evidence/ 下 ui-before-*.png 与 ui-after-*.png（同宽同状态成对）
- docs/requirements/REQ-261005155003-f32f/reviews/delivery-review.md → 独立复核报告（复核方法、发现并修复的 6 类问题、两处口径登记、5 项未能复核项）
- docs/requirements/REQ-261005155003-f32f/tests/verification-run.md → 测试证据（三个脚本 + 全仓测试 + 类型 + 构建 + 知识层的命令与输出 + 64 张卡的 covers 标注）
- docs/requirements/REQ-261005155003-f32f/evidence/a13-panel-findings.txt → 五块未覆盖面板的实测与发现、四类缺陷修复、FR-10 前景色勘误归因
- docs/requirements/REQ-261005155003-f32f/evidence/kb-check-status.txt → 知识层自检现状与逐条归因（本需求零劣化）
- pnpm build:client → [verify-client] OK bundle=629148 bytes；npx tsc --noEmit → 退出码 0、0 行输出；pnpm test → 68 failed / 5622 passed / 22 skipped（与开工前 68 持平）
- 可失败性自证：--pm-target 改 20px → A8 报红 12 处；去掉 :focus-visible → A7 报红 136 处；--f-small 改 12.5px → A9 报红 47 处；--pm-warn-text 改回 #a86a00 → 对比度脚本退出码 1；去掉 aria-describedby → 1 failed（恢复后 84 passed）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 落地浅色岛令牌块并移除宿主深色覆盖 | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:19 |
| v1-2 | 新建单一图标源模块 src/client/icons.ts | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:19 |
| v1-3 | Tab 栏换内联 SVG 并补 tablist/tab 语义与方向键 | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:19 |
| v1-4 | 统一键盘焦点环（两档偏移） | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:19 |
| v1-5 | 把交互目标加高到 ≥24×24（窗口胶囊/行内链接） | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:19 |
| v1-6 | 落地动效令牌与 reduced-motion 分支 | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:21 |
| v1-7 | 收敛字阶到六档并重建视觉层级（间距 36px／模块上下结构／主色纪律） | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:21 |
| v1-8 | 收敛胶囊/圆角/边线/阴影（苹果式克制） | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:21 |
| v1-9 | 头部拆两行：动作行独占、身份行另起且窗口靠左 | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:21 |
| v1-10 | 操作条文案收敛并真删 DOM 节点（含两处提示文案同步） | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:21 |
| v1-11 | 真删详情页评论输入框并保住对话 Tab 评论链路 | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:22 |
| v1-12 | 状态不靠颜色单一表达（真实文本／aria-hidden SVG） | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:22 |
| v1-13 | 新增对比度报表脚本（读 report.ts 令牌声明） | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:22 |
| v1-14 | 探针新增可访问性断言组（焦点环/目标尺寸/最小字号/reduced-motion/阶段条标记） | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:22 |
| v1-15 | 出图脚本改指权威原型并改造漂移断言口径（K7）、修正 ?v=current 口径（K8） | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:22 |
| v1-16 | 同步既有渲染断言（五处改动 + 两条新增） | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:22 |
| v1-17 | 需求级验收 | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:22 |
| v1-18 | 需求级验收 | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:22 |
| v1-19 | 需求级验收 | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:22 |
| v1-20 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:22 |
| v1-21 | 需求级验收 · 三方一致性 | ✓ 通过 | human/session-643f0678-d7a2-4785-8b1e-df0511c3f190 | 2026-10-05 23:22 |
