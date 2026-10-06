# 设计：用例与判定（REQ-261005200052-ce40）

> 面：四类场景的时序，以及"什么票拦、什么票放"的完整判定表。

## 场景一：显式登记原型后继续提交 <!-- serves: FR-1 -->

```
修前
  agent ──reqboard_submit(kind=prototype)──▶ 登记成功
                                              └─ triggerAutoConfirm(kind=prototype)
                                                   └─ 人不在（2 秒宽限过）⇒ 票 pc-xxxxxx（无门产物）
  agent ──reqboard_submit(kind=requirement)──▶ ✗ REQBOARD_CONFIRM_PENDING（整窗口锁）
                                              自救：①只读 ✗ ②看板无控件 ✗ ③重发再钉一张 ✗ ⇒ 干等 30 分钟

修后
  agent ──reqboard_submit(kind=prototype)──▶ 登记成功 + 通知（无票）
  agent ──reqboard_submit(kind=requirement)──▶ ✓ 正常受理
```

## 场景二：真门确认照拦，且出路可点 <!-- serves: FR-2, FR-6 -->

```
  agent ──reqboard_submit(kind=verification)──▶ 验收材料登记 + 自动弹确认（G4 真门）
                                                   └─ 人不在 ⇒ 票 pc-yyy（kind=verification，产物在册）
  agent ──reqboard_move(...)──▶ ✗ REQBOARD_CONFIRM_PENDING
                                  文案：② 到项目看板点确认按钮 ← 真的存在（G4 有门 ⇒ 卡面有控件）
                                  ⇒ 人一点即解
```

行为与本次改动前**逐字一致**（真门口径不放宽）。

## 场景三：有门但无产物的"空票" <!-- serves: FR-2, FR-5 -->

```
  修前：agent 对未登记产物的需求发 ask_confirm ⇒ 票先登记、落章失败（MISSING_ARTIFACT）
        ⇒ 票留在表里，人点看板也答不了（看板确认同样要求产物在册）⇒ 窗口锁 30 分钟

  修后：同一调用在**登记票之前**就被拒（REQBOARD_MISSING_ARTIFACT）
        ⇒ 不产生票、不拦写路径；文案指向「先登记产物」这条真实下一步
        若存量里已存在这种票：谓词⑤（无产物）⇒ 放行；产物一旦登记，拦截立刻恢复
```

## 场景四：终态需求的陈旧票 <!-- serves: FR-3 -->

```
  需求 X 归档后，它那张未作答的票还在
    agent 对**别的**需求干活 ──▶ 修前：被 X 的票拦住，且三条路只有"人点 X 的看板"能解
                              修后：X 的产物集不再增长、该票要么无产物（放行）要么有产物（仍拦但文案写明
                                    「该需求已归档：agent 侧无法覆盖，请人点看板或等 {expiresAt} 自动失效」）
```

## 判定表（唯一口径） <!-- serves: FR-2 -->

| 票的 target / kind | 该 kind 有确认门 | 台账该 kind 产物数 | 台账已落章 | 结果 | 可选出路 |
|---|---|---|---|---|---|
| artifact / requirement | ✓ | ≥1 | 否 | **拦** | ①②③ |
| artifact / design | ✓ | ≥1 | 否 | **拦** | ①②③ |
| artifact / decomposition | ✓ | ≥1 | 否 | **拦** | ①②③ |
| artifact / verification | ✓ | ≥1 | 否 | **拦** | ①②③ |
| artifact / **prototype** | ✗ | — | — | **放行** | 仅①（+ 说明「无需人工确认」） |
| artifact / 任意 kind 无门 | ✗ | — | — | **放行** | 仅① |
| artifact / 任意门 kind | ✓ | **0** | 否 | **放行** | ① + 「先登记产物」 |
| artifact / 任意 | — | — | ✓ | 放行（既有口径） | ① |
| plan | ✓（G3） | — | `plan` 在册 | **拦** | ①②③ |
| plan | ✓（G3） | — | `plan` 不存在 | **放行** | ① + 「先提交计划」 |

判定序（实现必须照此顺序，短路即返回）：

```
注册表：未 settle 且未过期        ← 否则 undefined
  → 台账查不到该需求              ← 保守留挂（返回该票）
  → 台账已落章（targetConfirmedInLedger）← 放行
  → 谓词④ 无门                    ← 放行
  → 谓词⑤ 无产物                  ← 放行
  → 拦
```
