/**
 * pmboard 样式分片 · report（需求详情页「工作汇报」壳，REQ-261004222448-292a）。
 *
 * ## 这一片是什么
 *
 * **报告页的外观收在自己这一层**（2026-10-05 重做，第二轮验收「样式还是不对」的处置）。
 *
 * 为什么必须自己一层：壳与六个面板沿用的是旧详情页的类（.dsh-pm-detail-head /
 * .dsh-pm-stats / .dsh-pm-tabs / .dsh-pm-block / .dsh-pm-dot …），而它们的**外观由旧分片定义**
 * ——两套视觉语言叠在一起，看出来的就是「旧详情页 + 一层补丁」。旧分片的规则**一个字都不许改**
 * （那是别的页面的长相），所以这里把报告页需要的全部外观**重写一遍**，并靠
 * .dsh-pm-detail[data-report-shell] 前缀把特异性提到旧规则之上（旧规则最高是
 * .dsh-pm-detail details.dsh-pm-fold summary 量级；本片对应写作 .dsh-pm-detail[data-report-shell] details.dsh-pm-fold summary）。
 *
 * ## 视觉唯一规范
 *
 * docs/requirements/REQ-261004222448-292a/prototype/detail-report.html 的内联 <style>。
 * 本片的每条规则都能指回原型那一段（注释里给的是原型的类名），尺寸/字号/间距用原型 :root 的原值
 * （--s1..--s6 / --pm-space-module / --r1..--r2 / --f-* / --lh-* / --page / --rail / --gap-col）。
 *
 * 色值口径（REQ-261005155003-f32f / FR-4）：**详情页是一座诚实的浅色岛，不跟随宿主主题**。
 * 全部颜色令牌取页面自持的浅色原值，一个宿主主题变量都不引——旧写法「引宿主令牌 + 回退值」是假跟随：
 * 它所引的四个名字在 DSH 里根本不存在（回退值恒生效），而三级灰引的那个宿主令牌在宿主深色下是
 * #adb2b8，白底上只剩 2.1:1（比浅色下更差）。宿主两套主题下本片**同一副长相**：岛内已无深色主题覆盖块。
 * 线条/底色一律走本片令牌（--pm-line / --pm-line-strong / --pm-bg-soft），规则里不写裸色值。
 *
 * ## 两条不许丢的规则（最上面两条）
 *
 *  - .dsh-pm-tab-panel { display: block }：面板包装器不吃内层滚动（FR-11 #7：一律铺开，长了走页面滚动；
 *    唯一豁免 = 对话面板的 .dsh-pm-chat-scroll 与 DAG 画布视口（高度随视口自适应内滚动，见 ⑧ 段 FR-6 标记块与 styles/dag.ts））；
 *  - 对话面板的消息行是 display:flex（气泡布局）——任何 display 规则都会盖掉浏览器默认的
 *    [hidden]{display:none}（那是最弱的一条），所以这里用**更高特异性**把隐藏规则钉死。
 *
 * ## 硬约束（本片自我约束，探针会真 DOM 实测）
 *
 * 全片**不出现** overflow 的 auto / scroll 取值，**也不出现**高度上限（不限高）：一律铺开、不做内层滚动。
 * **唯一豁免**（REQ-261006130057-7a43 · FR-6 · D-5/D-7，architecture §边界裁决 3）：对话面板的
 * .dsh-pm-chat-scroll——高度随视口自适应（clamp(320px, 100vh-420px, 880px)）、纵向内滚动，吸顶分页条挂在它里面（见 ⑧ 段 FR-6 标记块）。
 * （这两个 CSS 片段刻意不在这里按原样写出：注释里留一份同样的字面量，会让「分片是否违规」只能靠
 *   人去分辨注释与规则——探针只看真 DOM，这条纪律也照同一口径表述。）
 * 高度是靠字号/行距/内边距收紧 + 少渲染几条挣回来的，不是靠把内容关进滚动框。
 */
import { BAND_CSS } from './report/band.js'
import { BASE_CSS } from './report/base.js'
import { HEAD_CSS } from './report/head.js'
import { DAG_CSS } from './report/panels/dag.js'
import { DIALOGUE_CSS } from './report/panels/dialogue.js'
import { DOCS_CSS } from './report/panels/docs.js'
import { PROMPTS_CSS } from './report/panels/prompts.js'
import { TOKEN_CSS } from './report/panels/token.js'
import { TRUNK_CSS } from './report/panels/trunk.js'
import { VERIFY_CSS } from './report/panels/verify.js'
import { SHARED_PUBLIC_CSS, SHARED_CROSS_CSS } from './report/shared.js'
import { TABS_CSS } from './report/tabs.js'
import { TOKENS_CSS } from './report/tokens.js'

/**
 * 拼接出口（对外名字与用法不变）。
 *
 * 顺序 = 改造前本文件的物理顺序：⓪base ①tokens ⑤公共件 ②head ③band ④tabs
 * ⑥trunk ⑦docs ⑪b verify ⑧dialogue ⑨token ⑩prompts ⑪dag … 公共收口层（⑫–⑱ 与 ⑰/㉑ 等）。
 *
 * ⑪b verify 插在 ⑦docs 之后：验收面板的表语汇沿用文档段（见 manifest 的 verify.dependsOn），
 * 归位后它的外观住自己的分片 `report/panels/verify.ts`。
 *
 * 为什么用模板字面量插值而不是 join('')：插值**不引入任何分隔符**，每个分片自己的
 * 段落头注释由下一个分片收尾（拼接约定，见 shared/panels 各片头注）；同时文件以反引号收尾，
 * 满足 verify-client-build 的分片截断校验。
 * 注：t2 时的「拼接 = 逆操作、与改造前逐字节相同」是**分片前的性质**；t4 归位改了组装顺序，
 * 之后由判据一（逐组件计算样式快照）保证外观不变。
 */
export const REPORT_CSS = `${BASE_CSS}${TOKENS_CSS}${HEAD_CSS}${BAND_CSS}${TABS_CSS}${SHARED_PUBLIC_CSS}${TRUNK_CSS}${DOCS_CSS}${VERIFY_CSS}${DIALOGUE_CSS}${TOKEN_CSS}${PROMPTS_CSS}${DAG_CSS}${SHARED_CROSS_CSS}`
