#!/usr/bin/env node
/**
 * 诊断 reqboard_capture 弹框失效问题
 * 
 * 检查点：
 * 1. userQuestions 服务是否正确注入
 * 2. GateAwareQuestions 装饰器是否正常工作
 * 3. UserQuestionsAdapter 的 available() 是否返回 true
 * 4. buildCaptureIntentQuestions 生成的问题结构是否正确
 */

console.log('=== reqboard_capture 弹框诊断 ===\n');

// 检查 1: 模拟 userQuestions 服务注入
console.log('【检查 1】userQuestions 服务注入模拟');
let userQuestionsSvc: unknown;
const mockCtx = {
  inject: (services: string[], cb: (c: any) => void) => {
    console.log(`  inject 被调用，请求服务: ${services.join(', ')}`);
    if (services.includes('userQuestions')) {
      // 模拟宿主注入
      cb({ userQuestions: { ask: () => Promise.resolve({ answers: [] }) } });
    }
  }
};

(mockCtx as any).inject(['userQuestions'], (uqCtx: { userQuestions?: unknown } | undefined) => {
  userQuestionsSvc = uqCtx?.userQuestions;
  console.log(`  userQuestionsSvc 已赋值: ${userQuestionsSvc !== undefined}`);
});

console.log(`  最终 userQuestionsSvc 状态: ${userQuestionsSvc !== undefined ? '✓ 已注入' : '✗ 未注入'}\n`);

// 检查 2: UserQuestionsAdapter.available()
console.log('【检查 2】UserQuestionsAdapter.available() 检查');
class TestAdapter {
  private resolve: () => unknown;
  constructor(resolve: () => unknown) {
    this.resolve = resolve;
  }
  
  available(): boolean {
    const svc = this.resolve() as any;
    const result = typeof svc?.ask === 'function';
    console.log(`  resolve() 返回: ${svc !== undefined ? '有服务' : 'undefined'}`);
    console.log(`  svc.ask 类型: ${typeof svc?.ask}`);
    console.log(`  available() 结果: ${result}`);
    return result;
  }
}

const adapter = new TestAdapter(() => userQuestionsSvc);
const isAvailable = adapter.available();
console.log(`  适配器状态: ${isAvailable ? '✓ 可用' : '✗ 不可用'}\n`);

// 检查 3: 推荐标记后缀正则
console.log('【检查 3】推荐标记后缀处理');
const RECOMMEND_SUFFIX_RE = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;

const testLabels = [
  '创建用户管理功能（推荐）',
  '创建用户管理功能 (推荐)',
  '创建用户管理功能（recommended）',
  '创建用户管理功能',
];

testLabels.forEach(label => {
  const stripped = label.replace(RECOMMEND_SUFFIX_RE, '');
  const hasMatch = RECOMMEND_SUFFIX_RE.test(label);
  console.log(`  "${label}"`);
  console.log(`    匹配: ${hasMatch}, 去除后: "${stripped}"`);
});

console.log('\n【检查 4】弹框问题生成');
// 模拟 buildCaptureIntentQuestions
function mockBuildQuestion(titleOptions: string[]) {
  const candidates = titleOptions.slice(0, 3);
  const nameOptions = candidates.map((label, i) => ({
    label: i === 0 ? label + '（推荐）' : label,
    description: i === 0 ? 'agent 推荐 · 最贴近本次意图' : undefined,
  }));
  
  if (candidates.length > 0) {
    nameOptions.push({
      label: '⚡ 全部按推荐值立项',
      description: '名称/类型/算力档位/文件落点全走推荐值',
    });
  }
  
  nameOptions.push({
    label: '✖️ 不需要立项',
    description: '本次不创建；30 分钟内本窗口不再弹立项框',
  });
  
  return [{
    id: 'name',
    header: '📋 PM · 立项确认',
    question: `建议立项：《${candidates[0]}》——修复 pm 插件弹框问题`,
    options: nameOptions,
  }];
}

const questions = mockBuildQuestion(['修复 reqboard_capture 弹框失效', '调试弹框问题', '排查立项功能']);
console.log('  生成的问题数量:', questions.length);
console.log('  第一个问题:');
console.log('    id:', questions[0].id);
console.log('    header:', questions[0].header);
console.log('    question:', questions[0].question);
console.log('    选项数量:', questions[0].options.length);
questions[0].options.forEach((opt, i) => {
  console.log(`    选项 ${i + 1}: "${opt.label}"${opt.description ? ` - ${opt.description}` : ''}`);
});

console.log('\n=== 诊断完成 ===');
console.log('\n【可能的问题】');
console.log('1. 如果 userQuestionsSvc 未注入 → 检查宿主是否正确调用了 ctx.inject()');
console.log('2. 如果 available() 返回 false → 检查 userQuestions 服务的 ask 方法');
console.log('3. 如果推荐标记未生效 → 检查选项 label 格式是否符合正则');
console.log('4. 如果问题生成有误 → 检查 buildCaptureIntentQuestions 的逻辑');
