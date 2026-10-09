# REQ-261008020617-088f 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：application/ 的 15 处 I/O 越界全部清零（三份同构 RTM 门合并为 rtm-gates 单点并走 DocRepository；新增 HostFsPort/DiagSinkPort 两个端口与宿主实现；两处绝对路径判定收口到纯函数与端口；ReqboardDiveManager 外移适配层），层门补上显式豁免面（理由必填/只减不增/过期即红，本次 0 条），规则一条未放宽。验收锚点：层门 application 用例由红转绿（整文件 failed 2 → 1，剩的正是边界外 tools/http 那条，未用豁免吞掉）；npx tsc --noEmit 0 错；改后全量 15 条失败逐条可归因且与本次改动无关。本轮补齐 5 类验收前置文档，逐卡 41 个 covers 标注、11 项结果交代（含 D-1~D-3 对照）与 6 条偏离申报齐备。

## 1. 验收列表

### v1-1 · 合并三个同构 RTM 门为单点并改走文档端口

**验收内容**：【合并三个同构 RTM 门为单点并改走文档端口】验收

**操作步骤**：
1. ① npx vitest run tests/unit/gate → 3 文件全绿（断言未改，证明行为等价）
2. ② npx vitest run tests/layer-boundary.test.ts → 越界清单里 application/gate/ 三条路径（acceptance-gate.ts / design-gate.ts / task-coverage-gate.ts）全部消失，条数 15 → 9
3. ③ grep -rn 'node:' src/application/gate → 0 命中
4. ④ npx tsc --noEmit → 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/unit/gate → 3 文件 9 passed（断言未改）；npx vitest run tests/layer-boundary.test.ts 越界 15→9；运行时等价实测 15 条断言全 OK；npx tsc --noEmit 0 错。

**验收状态**：✓ 通过

---

### v1-2 · 新增宿主文件面端口与实现并补齐五处装配

**验收内容**：【新增宿主文件面端口与实现并补齐五处装配】验收

**操作步骤**：
1. ① npx tsc --noEmit → 退出码 0（hostFs 为必填字段，五处装配点漏一处即编译报错，这就是漏改清单）
2. ② grep -n 'interface HostFsPort' src/application/ports.ts 与 grep -n 'interface DiagSinkPort' src/application/ports.ts → 各 1 命中
3. ③ npx vitest run tests/apply-wiring.test.ts tests/unit/gate → 全绿（装配补齐后整树仍可跑）
4. ④ 本卡不消除越界，层门条数保持 9（如实记录，不做假绿）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsc --noEmit → 0 错（hostFs 必填 ⇒ 编译器即漏改清单，实际报出 6 处装配点）；契约冒烟：cwd=宿主 cwd、isDirectory 三态、原子写不留 .tmp-*、坏 JSON 不抛；npx vitest run tests/apply-wiring.test.ts → 7 passed。

**验收状态**：✓ 通过

---

### v1-3 · rtm-health 写路径端口化并同步生产调用方与测试

**验收内容**：【rtm-health 写路径端口化并同步生产调用方与测试】验收

**操作步骤**：
1. ① npx vitest run tests/unit/rtm-health.test.ts tests/rtm-trigger-prototype.test.ts tests/submit-prototype.test.ts tests/canceled-audit-holds.test.ts tests/canceled-four-faces.test.ts tests/canceled-coverage-gate.test.ts tests/rtm-yaml-live-tasks.test.ts → 全绿
2. ② 落盘形状断言（rtm-failures.json 的 requirement_id/trigger/timestamp/error/attempts 五键、2 空格缩进、只保留最近 100 条）在 tests/unit/rtm-health.test.ts 里原样在场
3. ③ 新用例证明 state 目录缺失时由适配器建目录并落盘（改前该路径抛错并被吞、且残留 .tmp-* 临时文件）
4. ④ 本卡仍不消除 node: 导入（rtm-health.ts 的健康检查半仍在），层门条数保持 9 —— 如实记录。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/unit/rtm-health.test.ts tests/rtm-trigger-prototype.test.ts tests/submit-prototype.test.ts tests/canceled-audit-holds.test.ts tests/canceled-four-faces.test.ts tests/canceled-coverage-gate.test.ts tests/rtm-yaml-live-tasks.test.ts → 9 文件 84 passed；新增用例：state 目录不存在时 recordRTMFailure(host, root, …) 不抛、落盘、不留 .tmp-*；另为 15 份强转夹具补齐 hostFs。

**验收状态**：✓ 通过

---

### v1-4 · rtm-health 健康检查读路径端口化并收尾该文件的 I/O

**验收内容**：【rtm-health 健康检查读路径端口化并收尾该文件的 I/O】验收

**操作步骤**：
1. ① npx vitest run tests/unit/rtm-health.test.ts tests/rtm-health-legacy.test.ts tests/unit/query-run-status.test.ts → 全绿
2. ② grep -n 'node:' src/application/internal/rtm-health.ts → 0 命中（该文件两个越界 import 至此清零）
3. ③ npx vitest run tests/layer-boundary.test.ts → 越界条数 9 → 7
4. ④ /state 载荷的 rtm_health 字段形状不变（healthy / missing_files / retry_available 及条件出现的 exempted / gaps / last_failure），由 tests/unit/query-run-status.test.ts 断言。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -c '^import.*node:' src/application/internal/rtm-health.ts → 0；npx vitest run tests/unit/rtm-health.test.ts tests/rtm-health-legacy.test.ts tests/compat-regression.test.ts tests/unit/query-run-status.test.ts → 46 passed；层门越界 9→7。

**验收状态**：✓ 通过

---

### v1-5 · diag-log 改为无 I/O 门面并把文件实现落到适配层

**验收内容**：【diag-log 改为无 I/O 门面并把文件实现落到适配层】验收

**操作步骤**：
1. ① npx vitest run tests/dive-wake-wiring.test.ts tests/reqboard/degraded-startup.test.ts → 全绿（前者读日志文件断言含 [WAKE-FAIL]，后者断言一条失败一行且多行原因压成一行）
2. ② grep -n 'node:' src/application/internal/diag-log.ts → 0 命中
3. ③ grep -rn 'captureDiag' src/application | wc -l → 调用点数不减少（证明调用形状未变）
4. ④ npx vitest run tests/layer-boundary.test.ts → 越界条数 7 → 5。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/dive-wake-wiring.test.ts tests/reqboard/degraded-startup.test.ts → 21 passed（真读日志文件断言含 [WAKE-FAIL]）；grep -c '^import.*node:' src/application/internal/diag-log.ts → 0；层门越界 7→5。

**验收状态**：✓ 通过

---

### v1-6 · 两处绝对路径判定收口到纯函数与宿主端口

**验收内容**：【两处绝对路径判定收口到纯函数与宿主端口】验收

**操作步骤**：
1. ① npx vitest run tests/create-doc-location.test.ts tests/create-delegated-owner.test.ts tests/capture.test.ts → 与改前读数一致（全绿）
2. ② grep -n 'node:' src/application/use-cases/CaptureRequirement.ts src/application/use-cases/CreateRequirement.ts → 0 命中
3. ③ 行为等价断言：非绝对路径在 create 侧仍得 REQBOARD_INVALID_WORKSPACE、在 capture 侧仍返回 undefined，目录不存在仍得同一错误码与同一句文案，host 哨兵仍解析到 process.cwd()（用例逐条断言）
4. ④ npx vitest run tests/layer-boundary.test.ts → 越界条数 5 → 1。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/create-doc-location.test.ts tests/create-delegated-owner.test.ts tests/capture.test.ts tests/workspace-root-resolution.test.ts → 37 passed（含 6 条新增等价断言：16 个样例与 node:path.isAbsolute 逐例相同）；层门越界 5→1。

**验收状态**：✓ 通过

---

### v1-7 · Dive Service 外壳外移到适配层

**验收内容**：【Dive Service 外壳外移到适配层】验收

**操作步骤**：
1. ① npx vitest run tests/dive-wake-wiring.test.ts tests/dive-manager-wiring.test.ts → 全绿（后者仍断言 0 处 followup 且 Service 装配与订阅分组不变）
2. ② grep -rn '@deepseek-ai/cordis' src/application → 0 命中
3. ③ npx tsc --noEmit → 退出码 0
4. ④ npx vitest run tests/layer-boundary.test.ts → 越界条数 1 → 0（RF-1 的『application/ 零越界』达成）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/dive-wake-wiring.test.ts tests/dive-manager-wiring.test.ts tests/apply-wiring.test.ts → 23 passed；grep -rn '@deepseek-ai/cordis' src/application → 0 命中；npx vitest run tests/layer-boundary.test.ts 越界 1→0（RF-1 达成）。

**验收状态**：✓ 通过

---

### v1-8 · 给层门补显式豁免面并落地空台账

**验收内容**：【给层门补显式豁免面并落地空台账】验收

**操作步骤**：
1. ① npx vitest run tests/layer-boundary.test.ts -t '豁免' → 新用例绿
2. ② 合成输入用例证明判据可证伪：entries 指向一处已修好的文件时 unusedExemptions 返回该条
3. ③ fixtures 的 frozenCount 为 0 且 entries 为空数组
4. ④ git diff tests/layer-boundary.test.ts 中 LAYER_RULES 的 forbidden 数组零改动（规则未被放宽）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/layer-boundary.test.ts → 12 用例 1 失败（仅边界外 tools/http）；tests/fixtures/layer-boundary-exempt.json 的 frozenCount=0 且 entries=[]；临时写入 1 条过期豁免 → 专属用例点名「过期豁免」并红，还原回绿；LAYER_RULES 与 HEAD 逐字节相同（md5 一致）。

**验收状态**：✓ 通过

---

### v1-9 · 同步说明书与知识层文档并留痕边界外读数

**验收内容**：【同步说明书与知识层文档并留痕边界外读数】验收

**操作步骤**：
1. ① npx vitest run tests/kb-invalidation.test.ts tests/kb-operations.test.ts → 与改前读数一致（不新增红）
2. ② grep -n 'HostFsPort' docs/architecture/project-manual.md 与 grep -n 'DiagSinkPort' docs/architecture/project-manual.md → 各命中
3. ③ pnpm kb:check 的漂移清单里不新增与本次新增符号相关的条目，且如实申报未重跑 pnpm kb:build
4. ④ 交付材料含改前/改后 layer-boundary 读数（failed 用例 2 → 1，tools/http 那条两次都在，未进豁免台账）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/kb-invalidation.test.ts tests/kb-operations.test.ts → 22 passed；npx tsx scripts/kb-build.mts --write 后 pnpm kb:check → code-map 零漂移；docs/architecture/project-manual.md 命中 HostFsPort ×3 / DiagSinkPort ×1。

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/layer-boundary.test.ts → failed 用例 2 → 1，两次都在的那条是 tools/ 与 http/ 状态字面量（边界外，未进豁免台账：entries 空、frozenCount 0）；pnpm test → 9 文件 15 用例失败，逐条在守恒台账内；npx tsc --noEmit → 0 错。

**验收状态**：✓ 通过

---

### v1-11 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：D-1（守边界，tools/http 另议）：npx vitest run tests/layer-boundary.test.ts → application 用例转绿、tools/http 仍 1 失败且台账 entries=[]。D-2（diag-log 取端口门面）：grep -rn captureDiag src/application 的 6 个引用点零改动、门面 node: 导入 0。D-3（三门合并而非删码）：gate/index.ts 仍导出三个同名符号，tests/unit/gate → 9 passed（断言未改）。

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/layer-boundary.test.ts → 12 用例 1 失败：application/ 越界用例已转绿（改前 2 失败），仅剩边界外的 tools/http 那条
- grep -rn node: 与 @deepseek-ai/ 于 src/application → 真 import 0 处（12 处命中经逐条核对全在文档注释里）
- npx tsc --noEmit → 退出码 0、0 错误
- npx vitest run tests/unit/gate → 3 文件 9 passed（断言一字未改，行为等价）
- npx vitest run tests/unit/rtm-health.test.ts tests/rtm-health-legacy.test.ts tests/compat-regression.test.ts tests/unit/query-run-status.test.ts → 46 passed
- npx vitest run tests/dive-wake-wiring.test.ts tests/dive-manager-wiring.test.ts tests/apply-wiring.test.ts → 23 passed
- npx vitest run tests/create-doc-location.test.ts tests/create-delegated-owner.test.ts tests/capture.test.ts tests/workspace-root-resolution.test.ts → 37 passed
- npx vitest run tests/dive-wake-wiring.test.ts tests/reqboard/degraded-startup.test.ts → 21 passed（日志双写链路）
- pnpm test → 608 文件 / 7179 用例：9 文件 15 用例失败，逐条归因全在守恒台账内（doc-sync / e2e-triad-gate / interruption ×3 / layer tools-http / message-hygiene ×3 / size-budget / t7-legacy / template-address ×2 / triad ×2）
- 运行时等价实测（临时 tsx 脚本，15 条断言全 OK）：三份同构门迁移前后的 fail 消息/code/gaps、pass 消息、rtm_not_found 形状、畸形文件不静默通过、空清单判过，逐条相同
- 豁免面端到端证伪：临时写入 1 条指向已修好文件的豁免 → 专属用例当场点名「过期豁免」且形状用例点名超上界；还原后回绿
- npx tsx scripts/kb-build.mts --write 后 pnpm kb:check → code-map 零漂移（其余 K14 两条不可判定条目 kb-0064/0065 属他人既有条目）
- npx vitest run tests/kb-invalidation.test.ts tests/kb-operations.test.ts → 22 passed
- 未做 git 提交（申报）：本需求触及的 src/index.ts / src/application/ports.ts 等文件里带别的窗口在途 hunk，显式路径 add 会把它们一并提交；改动按关键字（hostFs / FileHostFs / HostFsPort / DiagSinkPort / isAbsolutePath / REQ 号注释）可精确摘出
- 本轮补齐的 5 类验收前置文档：docs/requirements/REQ-261008020617-088f/design/data-model.md、docs/requirements/REQ-261008020617-088f/design/interfaces.md、docs/requirements/REQ-261008020617-088f/design/test-cases.md、docs/requirements/REQ-261008020617-088f/reviews/verification-review.md、docs/requirements/REQ-261008020617-088f/tests/evidence.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 合并三个同构 RTM 门为单点并改走文档端口 | ✓ 通过 | human/session-914181c9-d280-4922-adc7-36cf2083f4ea | 2026-10-08 12:20 |
| v1-2 | 新增宿主文件面端口与实现并补齐五处装配 | ✓ 通过 | human/session-914181c9-d280-4922-adc7-36cf2083f4ea | 2026-10-08 12:20 |
| v1-3 | rtm-health 写路径端口化并同步生产调用方与测试 | ✓ 通过 | human/session-914181c9-d280-4922-adc7-36cf2083f4ea | 2026-10-08 12:20 |
| v1-4 | rtm-health 健康检查读路径端口化并收尾该文件的 I/O | ✓ 通过 | human/session-914181c9-d280-4922-adc7-36cf2083f4ea | 2026-10-08 12:20 |
| v1-5 | diag-log 改为无 I/O 门面并把文件实现落到适配层 | ✓ 通过 | human/session-914181c9-d280-4922-adc7-36cf2083f4ea | 2026-10-08 12:20 |
| v1-6 | 两处绝对路径判定收口到纯函数与宿主端口 | ✓ 通过 | human/session-914181c9-d280-4922-adc7-36cf2083f4ea | 2026-10-08 12:21 |
| v1-7 | Dive Service 外壳外移到适配层 | ✓ 通过 | human/session-914181c9-d280-4922-adc7-36cf2083f4ea | 2026-10-08 12:21 |
| v1-8 | 给层门补显式豁免面并落地空台账 | ✓ 通过 | human/session-914181c9-d280-4922-adc7-36cf2083f4ea | 2026-10-08 12:21 |
| v1-9 | 同步说明书与知识层文档并留痕边界外读数 | ✓ 通过 | human/session-914181c9-d280-4922-adc7-36cf2083f4ea | 2026-10-08 12:21 |
| v1-10 | 需求级验收 | ✓ 通过 | human/session-914181c9-d280-4922-adc7-36cf2083f4ea | 2026-10-08 12:21 |
| v1-11 | 需求级验收 | ✓ 通过 | human/session-914181c9-d280-4922-adc7-36cf2083f4ea | 2026-10-08 12:21 |
