---
req_id: REQ-261005151245-54ae
kind: notes
---

# 设计偏差登记（四项加性偏差）

> 为什么有这份文件：独立复核（t-d685ff 两轮）确认下表四项**都不动已确认设计的任何外部契约**
> （端口三方法签名、工具入参、回执形状、三入口语义全部未变），因此**不改**已人确认的
> `design/*.md`（改它会作废确认章、要重走人工门）；但偏差必须落在**归档可见**的位置，
> 否则未来读者从设计侧对不上实现。归档时本文件按 `kind=notes` 收进文档清单。

## 1. 额外导出 ×2（相对 `interfaces.md` §内部模块「四个导出」）

| 导出 | 位置 | 为什么需要 |
|---|---|---|
| `normalizeWindowProfile(raw)` | `src/application/internal/window-inherit.ts` | 「什么算有读数」的**唯一判定**（空串/纯空白/非字符串一律按缺失）。上层对端口返回值做防御性归一时也调它 |
| `windowProfileFromProjectionValues(values)` | 同上 | 宿主投影值（`values.modelSelection.next`）→ 画像的**唯一映射**；适配器 `readProfile` 调它，避免适配器与编排各写一份映射（漂移风险） |

## 2. `presetInheritanceOf` 多回带一个键 `agentPreset`

- 冻结签名（`interfaces.md` §内部模块）：`{ status, reason? }`；实现：`{ status, reason?, agentPreset? }`。
- 语义：**仅 `mode === 'create'` 时回带**——调用方拿它拼建会话请求体；`fork` 不回带（宿主已继承，不该重复设）。
- 收益：`create` 三处调用点（`OpenWindow.ts` / `HandoffOwner.ts` / `settings-support.ts`）不再各自读
  `sourceRead.profile?.agentPreset`（模块外零命中）⇒「哪条路怎么带上预设」只剩一个真相，
  且回执里的 preset 三态与请求体同源，不可能分叉。
- 曾有一个 `carriedBy`（`'create-request' | 'host-inherit'`）字段，复核指出它只被用例消费、属设计外表面，已删除。

## 3. 「逐字取源读数」的准确含义 = 去首尾空白后逐字

- FR-4 验收 1 写「入参**逐字**取源读数」；实现先 `trim` 再判缺失/回带（`textOf` / `selectionOf`）。
- 精确口径：**空白裁剪后逐字**；空串与纯空白一律按「源没有该读数」处理（不写空标题、不传空推理档）。
- 影响面：只有含首尾空白的畸形读数会与"纯逐字"不同；正常读数字节一致。

## 4. 读失败原因新增第三种尾巴

- `interfaces.md` §`reasons` 文案规则把 `<读失败原因>` 列了两种取值：
  `未装配读画像能力（readProfile）`、`读画像失败：<宿主错误原文>`。
- 实现新增第三种（**必要扩写**，堵的是同一类「读不到被报成源没有」的编造）：
  `读画像失败：读画像未返回画像（readProfile 应抛错或返回对象）` ——
  端口契约要求"读不到就抛"，不合契约的替身返回 `undefined` / `null` 时按**读不到**处理
  （三项 `failed`），而不是当成"源窗口没有这项"（三项 `skipped`）。
- 触发面：只有测试替身 / 非法实现会走到这一支；生产适配器 `SessionWindowOpener.readProfile` 对
  「服务未装配 / 宿主抛错 / 会话不存在」一律抛错。

## 附：复核留痕

- 复核卡：`t-d685ff`（独立子代理，两轮只读复核；首轮判「不可判通过」并给出 1 条阻断 + 9 条建议，
  第二轮确认阻断与建议 1/2/4（连带 3/6/8/9）全部闭环、**判通过**）。
- 本文件第 1/3/4 项即复核要求登记的偏差；第 2 项为复核建议的替代实现（删字段 + 让 `mode` 真正有用）。
