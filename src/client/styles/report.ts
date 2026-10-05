/**
 * pmboard 样式分片 · report（需求详情页「工作汇报」壳，REQ-261004222448-292a）。
 *
 * 分片边界（谁该往这里写）：
 *  - **只放详情壳自己的东西**：常驻头部段 / 状态带段 / Tab 栏段 / 面板包装器（`data-tab-host`）
 *    与六个面板共同的排版约定；
 *  - 六个面板的**专属**类名（`.dsh-pm-trunk*` / `.dsh-pm-docs*` …）按同一约定续写在本分片末尾
 *    （它们是同一棵 DOM 树上的东西，拆成六片只会让"同一处改样式"变成六处）；
 *  - 纯新增区段，**不改既有选择器**（拼接顺序见 `styles.ts`：本片追加在末尾）。
 *
 * 本片目前只放一条：对话面板的页内检索靠 `hidden` 属性 + `data-msg-hit` 双判据隐藏不命中的消息，
 * 而既有分片里若有 `display` 规则盖在那些节点上，`[hidden]` 就会失效（浏览器默认 `[hidden]{display:none}`
 * 是**最弱**的一条，任何 `display: block/flex` 都能盖掉它）。因此这里把隐藏规则显式钉死。
 */
export const REPORT_CSS = `
/* 详情壳：面板包装器不吃内层滚动（FR-11 #7：一律铺开，长了走页面滚动） */
.dsh-pm-tab-panel { display: block; }

/* 对话面板页内检索：不命中的消息必须真的看不见（双判据，防被别处的 display 规则盖掉） */
.dsh-pm-msg[hidden],
.dsh-pm-msg[data-msg-hit="0"] { display: none; }
`
