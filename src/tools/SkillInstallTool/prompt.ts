/**
 * reqboard_skill_install 工具提示词（REQ-261005122347-e07a FR-1 / FR-6）。
 *
 * 读者是**主 agent**：它要在派原型子代理前拿到两个绝对路径。所以说明按"调一次拿到什么"写，
 * 不按实现写。
 */
export const SKILL_INSTALL_PROMPT = [
  '把插件自带的 UI/UX skill 资产投放到会话工作区，并返回子代理要用的绝对路径。',
  '',
  '什么时候用：需求分析阶段判断本次要做界面/交互原型时，**派原型子代理之前**先调一次。',
  '调用后：',
  '- 资产落到 <工作区>/.dsh/skills/（该目录自忽略 git，过程资产，rm -rf 即完全回滚）',
  '- 返回 root（投放根）与 searchScript（检索脚本绝对路径）——把这两个路径写进子代理的派发 prompt',
  '- 返回 python.found/version：false 表示这台机器检索不了，派发时必须如实告诉子代理「未做数据库检索」',
  '',
  '幂等：资产与清单逐文件一致时 reused=true 且一个字节都不写；怀疑内容损坏可加 force=true 重写。',
  '',
  '错误码：REQBOARD_SKILLS_DISABLED（开关关了）/ REQBOARD_SKILLS_ASSET_MISSING（装机漏打包）/',
  'REQBOARD_SKILLS_UNKNOWN_SKILL（skills 里给了非受控名）/ REQBOARD_SKILLS_WRITE_FAILED（写盘失败，不留半份）。',
].join('\n')
