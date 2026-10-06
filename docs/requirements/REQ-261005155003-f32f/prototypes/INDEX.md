| 路径 | 状态 | 服务条款 | 被取代于 |
|---|---|---|---|
| prototypes/detail-ui-v2.html | **契约源（design contract）** | FR-1 · FR-2 · FR-3 · FR-4 · FR-5 · FR-6 · FR-7 · FR-8 · FR-9 · FR-10 · FR-11 | — |
| prototypes/detail-ui-v3.html | 实现的渲染镜像（render mirror） | FR-1 ～ FR-13（同实现） | — |

## 这两份原型是什么关系（2026-10-05 事故后重写）

**v2 = 设计契约本体。** 它的「改造层」（`<style>` 块 ②，95 条 `html[data-proto-v="next"]` 规则）
就是"这一页改造完之后该长什么样"的**唯一权威文本**；实施期的任务是把这一层
**逐段并进 `src/client/styles/report.ts`**（原型自己的原话：「选择器去掉前缀即可，其余一字不改」）。

**v3 = 实现自己的渲染镜像。** 它的正文是 `buildReportShell(...)` 的逐字节输出、CSS 是 13 片真实拼接，
用途是"一眼看明白实现现在长什么样"，**不能当契约基准**。

⚠️ **本表原先写反了**（v3 authoritative / v2 superseded）。代价是真实的：
按"v3 是权威"去防漂移，就会把 v3 重新内联成实现的样子——实现偏什么、原型就跟着偏什么，
判据成了「实现 == 实现」的同义反复，**把 58 类偏离一次性固化成了"零漂移"**，
其中包括整段没落地的 Tab 栏分段控件。见 `evidence/design-conformance-fix.md`。

## 判据（改这一页时必跑）

- `npx tsx scripts/req-detail-design-conformance.mts` —— 把 v2 改造层**整层叠回实现**逐元素比对，
  差异必须为空（已被裁定取代的项走白名单，逐条给依据）；同时断言 v3 内联的 CSS
  与当前 13 片拼接**逐字节同源**（否则 v3 画的是旧样式，"拿原型看效果"这件事就假了）。
  实测可红：把 Tab 轨道底色改回 `none` → exit 1；还原 → exit 0。
- 判据会跑**两个状态**（在途 + 终态）并比 **`::before`/`::after` 内容**——
  只跑在途、或只比属性不比伪元素，都会漏（2026-10-05 双双踩过：终态阶段标记叠成 `✓✓`）。
- `npx tsx scripts/req-detail-ui-prototype-shot.mts` —— v3 出图 + 几何回填（改了 `report.ts` 后要重跑，
  它会连同内联 CSS 一起刷新；v2 **不要动**，它是契约）。
