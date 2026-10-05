/**
 * reqboard_kb 的一句话说明（REQ-261001110934-3766 t4）。
 *
 * 为什么单独成文件、且**写完不再改**：工具 `description` 是**每轮常驻成本**，
 * 且 prompt 缓存按前缀命中——描述一改，前缀缓存整体失效（DeepSeek 谷时命中价 ≈ 未命中的 1/50）。
 * 需要更长的用法说明时，写进阶段提示词片段，不要改这里。
 *
 * @module dsh-pmboard/tools/KnowledgeTool/prompt
 */

export const KNOWLEDGE_PROMPT =
  '检索项目知识层（架构/规范/前端令牌/决策/坑/契约/术语/代码地图）：按 id 精确取、按 kind 列一类、或按 query 找；'
  + '返回受 budgetChars 约束，装不下只回指针（不返回碎片正文）。'
