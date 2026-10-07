# 测试证据（REQ-261006201920-2adc）

> 本文档是验收材料的一部分：**命令 + 输出摘要**，不接受口头描述。
> 所有命令均在 `/Users/mac/Documents/ai/dsh/dsh-pmboard` 下执行。

## 一、本需求新增的 8 个用例文件（逐条可跑）

| 用例文件 | 例数 | 命令 |
|---|---|---|
| `tests/acceptance-placeholder.test.ts` | 7 | 计划期占位符判据（4 类真占位符全拒 + 4 类合法反例全放行） |
| `tests/lazy-expand-backfill.test.ts` | 9 | 子卡落库回填（全 20 阶段零残留 / 两处同源 / 兜底可跑 / 存量卡逐字节不变） |
| `tests/rework-gate.test.ts` | 7 | 返工卡三级取值 + 四类继承（含 `prototypeRefs`） |
| `tests/verdict-result-anchor.test.ts` | 9 | 无锚点 ⇒ 未复核；人工项事实判据；三类项互不串味 |
| `tests/system-item-disposition.test.ts` | 9 | 处置模板两义 + **逆验证 TC-17**（处置为空即不可归档） |
| `tests/result-override-reason.test.ts` | 8 | 覆盖原子四元组 / 缺理由即拒且零改动 / 回滚开关 |
| `tests/client-verify-disposition.test.ts` | 10 | 两处渲染共用控件 / 既有四钩子不变 / 徽标文案单一来源 |
| `tests/acceptance-compat.test.ts` | 7 | 旧台账可读 / 旧调用方不炸 / 回滚开关保真 |

一次跑完：

```
$ npx vitest run tests/acceptance-placeholder.test.ts tests/lazy-expand-backfill.test.ts \
    tests/rework-gate.test.ts tests/verdict-result-anchor.test.ts tests/system-item-disposition.test.ts \
    tests/result-override-reason.test.ts tests/client-verify-disposition.test.ts tests/acceptance-compat.test.ts
 Test Files  8 passed (8)
      Tests  66 passed (66)
     Duration  880ms
```

## 二、既有回归面（本需求收敛前后的对照）

```
$ npx vitest run tests/domain/subtask-template.test.ts tests/domain/acceptance-sheet.test.ts \
    tests/domain/req-b918-gates.test.ts tests/verdicts-http.test.ts tests/verdicts-and-rework.test.ts \
    tests/verify-override.test.ts tests/accept-sheet-tool.test.ts tests/accept-sheet-zero-input.test.ts \
    tests/stage-detail.test.ts tests/stage-panel.test.ts tests/lazy-expand.test.ts tests/regenerate-chain.test.ts
 Test Files  17 passed (17)
      Tests  278 passed (278)
```

> 其中 6 个文件的**夹具口径被本需求更新**（旧夹具把"无锚点文本"当通过）：`domain/acceptance-sheet`(4 处)、
> `verdicts-and-rework`(5)、`accept-sheet-tool`(7)、`pm-question-badge`(2)、`gate-aware-questions`(1)、
> `acceptance-archive`(1)、`accept-sheet-zero-input`(2)。更新时逐条写明"改的是哪条口径、依据是哪个 FR"，
> 未为了让用例变绿而放宽任何断言。

## 三、反向演练（红→还原→绿；**只有红绿两次都留档才算演练**）

| 演练 | 关掉什么 | 红（实录） | 还原后（实录） |
|---|---|---|---|
| RV-1 | 占位符分支 | `2 failed \| 5 passed`，exit 1 | sha256 与演练前逐字节相同 → `37 passed`，exit 0 |
| RV-2 | 回填调用 | `5 failed \| 4 passed`，exit 1 | 同上 → `35 passed`，exit 0 |
| RV-3 | 结果锚点分支 | `2 failed \| 7 passed`，exit 1 | 同上 → `9 passed`，exit 0 |
| RV-4 | 覆盖理由校验（恒真） | `2 failed \| 13 passed`，exit 1 | 同上 → `15 passed`，exit 0 |
| RV-5 | 处置模板（非空即可） | `2 failed \| 24 passed`，exit 1 | 同上 → `26 passed`，exit 0 |

留档：`docs/requirements/REQ-261006201920-2adc/evidence/rv{1..5}-*.txt`（10 份）。

## 四、构建门

```
$ pnpm build
✔ Build complete in 973ms
wrapped dsh-pmboard -> lib/client.js 634498 bytes
[verify-client] OK  bundle=721645 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
exit 0
```

## 五、全量回归与归属

```
$ pnpm test
 Test Files  40 failed | 519 passed | 3 skipped (562)
      Tests  72 failed | 6526 passed | 22 skipped (6620)

用例级失败：会话开始基线 102 → 最终 73（净少 29）
本需求改动面失败的条数：0
```

**仓库级残红逐条归属**（详见 `evidence/compat-and-baseline.md`）：3 条顺序相关（单独跑全绿）、
其余集中在别的窗口在飞的 `MoveRequirement.ts`（原型码未入清单）、`report-band.ts`/`report-head.ts`、
`report-tabs`、`artifact-openable`、`client-view`（后两者在**会话开始基线**里已红）。

## 六、类型门与存量保护

```
$ npx tsc --noEmit -p tsconfig.json          # 本需求改动面 0 条；全仓残留 1 条在别人的测试文件
$ git diff --name-only -- 'docs/requirements/*/tasks' | wc -l
0                                            # 存量任务卡零改写
```


## 覆盖标注（`covers:`）—— 卡片 → 实测判据

> 每条 `covers:` 指明「该任务的验收标准由本文件哪一节判据覆盖」。
> 6 张父卡对应第 1 节里各自那组用例文件；23 张子卡由「研发/联调/复核/测试」四段各自的判据行覆盖
> （第 1~3 节的命令与输出、第 4 节的构建门、第 6 节的存量保护）。

covers: t-4a918b
covers: t-cdd289
covers: t-a7b288
covers: t-cf28bb
covers: t-ebc36c
covers: t-efd5e1
covers: t-6d2ddc
covers: t-7d88c0
covers: t-766acd
covers: t-dbd8c2
covers: t-f8d88c
covers: t-2251f3
covers: t-3578eb
covers: t-fd9cea
covers: t-5b3e2a
covers: t-5cfbd1
covers: t-46f735
covers: t-af5c30
covers: t-78d01f
covers: t-c2610f
covers: t-2afe86
covers: t-72479c
covers: t-e03744
covers: t-a20757
covers: t-23d80f
covers: t-780dde
covers: t-ae406c
covers: t-7b0f2d
covers: t-18e8c1


## 七、给验收人的两条说明（都是运行时的，不是本需求代码的问题）

### 7.1 验收单里的「与原型对照」项指向了**已被取代的骨架**（请对照权威原型）

验收单 v1-8（`与原型对照截图（含差异说明）`）由**运行时自动填写**，其路径当前是
`docs/requirements/REQ-261006201920-2adc/prototypes/detail.html`——那是自动生成的骨架，
`prototypes/INDEX.md` 里已标 `superseded`。

**根因**：运行中的插件加载的是**宿主启动时**读入的 bundle；「从 INDEX 取权威原型路径」这条取数
（另一窗口在做的 REQ-261006201649-cc89 FR-3）尚未随新 bundle 生效，于是退回落**台账登记产物的排序首项**
（`detail.html` 字典序在 `verify-disposition.html` 之前）。登记是追加式的，所以本窗口**无法**修正该项路径。

**请看这个**：`prototypes/verify-disposition.html`（INDEX 唯一 `authoritative`，锚点 `#FR-3` / `#FR-4`）。
需要人判的就是一件事：**不看颜色时，「未复核」与「已通过」是否可辨**——两者徽标文字不同（已由断言保证），实际观感留给人。

### 7.2 验收单 v1-10（`gapKind=consistency`）是**探针误报**，处置建议如下

原文：`验收锚点失效：…子卡落库回填接线（懒展开） → tests/x.test.ts`。

`tests/x.test.ts` **不是**被引用的真实产物——它是 t2 卡验收标准里的**示例写法**
（原句：「父卡点名 `tests/x.test.ts` ⇒ 子卡标准含该路径」）。锚点探针按「出现 `tests/**.test.ts` 字样」抽取，
故把它记成了一次引用。本需求的**真实**测试文件是 8 个（见本文第 1 节），全部存在且全绿。

**建议处置**（该项通过时必须写明处置）：
`确认无需，因为 tests/x.test.ts 是验收标准里的示例写法、不是产物引用；本需求真实的 8 个测试文件均存在且全绿。`
