---
doc: design/frontend
req: REQ-261007223647-da5d
serves: FR-3, FR-5, FR-6
---

# 前端设计（REQ-261007223647-da5d · 轻档）

> 原型：[prototypes/INDEX.md](../prototypes/INDEX.md) 唯一 authoritative = `prototypes/detail.html`；
> 锚点 `#FR-3`（弹框内容）、`#FR-5`（pending 票）、`#FR-6`（地址对照）——锚点单独记账，不进 serves。
> 引用裁定：D-6（算力档位）、D-8（文件落点方案 A）、D-9（宿主契约：选项无富样式、推荐标记宿主自绘）。

## 组件树 · serves: FR-3, FR-5, FR-6

```
看板页（board-mount）
└─ PendingConfirmBand            [新 · 首屏顶部，pending_confirms.length > 0 才渲染]   serves: FR-5
   └─ PendingTicketRow（叶子，一票一行）
      ├─ TicketTitle（叶子：target/kind + 需求短名）
      ├─ TicketCountdown（叶子：remaining_ms 本地倒计时；已超时态）
      ├─ TicketAnswerBtn（叶子：跳验收单/确认区作答）
      └─ TicketRepostBtn（叶子：POST /confirms/:ticket/repost）
会话面板（conversation-progress）
└─ DocLocationLine（既有）
   └─ RootSourceBadge（叶子 [新]：rootSource ≠ req-root → 红字「地址可能不准（根来源：X）」）  serves: FR-6
立项弹框（宿主渲染，非本仓组件）
└─ 本仓只产数据：capture-mapping 的 4 问题目（宿主契约见 data-model DM-1）            serves: FR-3
```

叶子组件 = 拆卡粒度单位；弹框内容无组件树（宿主黑盒，D-9③），其"叶子"= IF-1/IF-2 两个纯函数。

## 交互路径 · serves: FR-5, FR-6

- FR-5：打开看板 → /state 带 pending_confirms → Band 钉顶；倒计时每秒本地递减（不轮询），
  到零切「已超时」态但票仍可答/可重投；点「去作答」跳既有确认区，点「重投」调 IF-4 后弹框出现。
- FR-6：面板渲染「📂 文档位置」→ docLocationHtml 读 peekLastRootSource → 非 req-root 追加红字徽章；
  打开行为不变（现状三级回落），红字只负责「不静默」。

## 样式归属 · serves: FR-5, FR-6

新样式进既有分片：Band/Row → `styles/report/band.ts`（与常驻状态带同族）；红字徽章 →
`styles/files.ts`（文档位置行同族）；遵守 C-05/C-12（改 client 必重建 bundle 且 verify OK）。

## 空态与降级 · serves: FR-5

无 pending → Band 不渲染（不占首屏）；老服务端无该键 → 按 `[]` 处理（data-model 兼容矩阵）；
取数失败 → Band 显示一行「pending 票读取失败」红字（不静默，FR-12 口径）。
