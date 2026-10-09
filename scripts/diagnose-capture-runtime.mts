/**
 * 立项弹框失效诊断工具
 * 
 * 使用方法：
 * 1. 确保 dsh-pmboard 插件已加载
 * 2. 在 DSH 控制台执行此文件
 * 3. 查看输出的诊断信息
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, '..');

console.log('=== reqboard_capture 弹框失效诊断 ===\n');

// 1. 检查关键源文件是否存在
console.log('【检查 1】关键源文件完整性');
const criticalFiles = [
  'src/index.ts',
  'src/adapters/UserQuestionsAdapter.ts',
  'src/adapters/GateAwareQuestions.ts',
  'src/application/use-cases/CaptureRequirement.ts',
  'src/application/internal/capture-mapping.ts',
  'src/tools/CaptureTool/CaptureTool.ts',
];

for (const file of criticalFiles) {
  try {
    const fullPath = join(pkgRoot, file);
    await readFile(fullPath, 'utf-8');
    console.log(`  ✓ ${file}`);
  } catch (err) {
    console.log(`  ✗ ${file} - 文件不存在或无法读取`);
  }
}

// 2. 检查关键代码片段
console.log('\n【检查 2】关键代码片段');

try {
  const indexContent = await readFile(join(pkgRoot, 'src/index.ts'), 'utf-8');
  
  // 检查 userQuestions 注入
  const hasUserQuestionsInject = indexContent.includes("inject?.(['userQuestions']") || 
                                  indexContent.includes("inject?.(\n    ['userQuestions']");
  console.log(`  userQuestions 注入代码: ${hasUserQuestionsInject ? '✓ 存在' : '✗ 缺失'}`);
  
  // 检查 GateAwareQuestions 装配
  const hasGateAwareQuestions = indexContent.includes('new GateAwareQuestions') &&
                                 indexContent.includes('new UserQuestionsAdapter');
  console.log(`  GateAwareQuestions 装配: ${hasGateAwareQuestions ? '✓ 存在' : '✗ 缺失'}`);
  
  // 检查 questions 端口注入到 useCaseDeps
  const hasQuestionsInUseCaseDeps = indexContent.includes('questions:') && 
                                     indexContent.includes('new GateAwareQuestions');
  console.log(`  questions 注入到 useCaseDeps: ${hasQuestionsInUseCaseDeps ? '✓ 存在' : '✗ 缺失'}`);
  
} catch (err) {
  console.log(`  ✗ 无法读取 src/index.ts: ${err.message}`);
}

// 3. 检查 capture-mapping 的弹框结构
console.log('\n【检查 3】capture-mapping 弹框结构');

try {
  const mappingContent = await readFile(join(pkgRoot, 'src/application/internal/capture-mapping.ts'), 'utf-8');
  
  // 检查推荐后缀正则
  const hasRecommendSuffix = mappingContent.includes('RECOMMEND_SUFFIX_RE') &&
                              mappingContent.includes('/\\s*(?:\\((?:recommended|推荐)\\)|（(?:recommended|推荐)）)\\s*$/i');
  console.log(`  推荐后缀正则: ${hasRecommendSuffix ? '✓ 正确' : '✗ 有问题'}`);
  
  // 检查 withRecommendLabel 函数
  const hasWithRecommendLabel = mappingContent.includes('export function withRecommendLabel') &&
                                 mappingContent.includes('+ \'（推荐）\'');
  console.log(`  withRecommendLabel 函数: ${hasWithRecommendLabel ? '✓ 存在' : '✗ 缺失'}`);
  
  // 检查 buildCaptureIntentQuestions
  const hasBuildIntentQuestions = mappingContent.includes('export function buildCaptureIntentQuestions');
  console.log(`  buildCaptureIntentQuestions: ${hasBuildIntentQuestions ? '✓ 存在' : '✗ 缺失'}`);
  
  // 检查拒绝项和一键过选项
  const hasRejectOption = mappingContent.includes('✖️ 不需要立项');
  const hasRecommendAllOption = mappingContent.includes('⚡ 全部按推荐值立项');
  console.log(`  拒绝选项: ${hasRejectOption ? '✓ 存在' : '✗ 缺失'}`);
  console.log(`  一键过选项: ${hasRecommendAllOption ? '✓ 存在' : '✗ 缺失'}`);
  
} catch (err) {
  console.log(`  ✗ 无法读取 capture-mapping.ts: ${err.message}`);
}

// 4. 检查 CaptureRequirement 用例
console.log('\n【检查 4】CaptureRequirement 用例');

try {
  const captureContent = await readFile(join(pkgRoot, 'src/application/use-cases/CaptureRequirement.ts'), 'utf-8');
  
  // 检查 available() 判断
  const hasAvailableCheck = captureContent.includes('deps.questions.available()');
  console.log(`  弹框通道可用性检查: ${hasAvailableCheck ? '✓ 存在' : '✗ 缺失'}`);
  
  // 检查两段式弹框
  const hasTwoStageDialog = captureContent.includes('buildCaptureIntentQuestions') &&
                             captureContent.includes('buildCaptureDetailQuestions');
  console.log(`  两段式弹框: ${hasTwoStageDialog ? '✓ 存在' : '✗ 缺失'}`);
  
  // 检查 askWithBudget
  const hasAskWithBudget = captureContent.includes('askWithBudget');
  console.log(`  askWithBudget 限时等待: ${hasAskWithBudget ? '✓ 存在' : '✗ 缺失'}`);
  
  // 检查 gate='G0' 声明
  const hasG0Gate = captureContent.includes("gate: 'G0'") || captureContent.includes('gate: "G0"');
  console.log(`  G0 闸门声明: ${hasG0Gate ? '✓ 存在' : '✗ 缺失'}`);
  
} catch (err) {
  console.log(`  ✗ 无法读取 CaptureRequirement.ts: ${err.message}`);
}

// 5. 给出诊断建议
console.log('\n【诊断建议】');
console.log('如果所有检查都通过，问题可能在于：');
console.log('1. 运行时 userQuestions 服务未被正确注入');
console.log('2. 宿主 DSH 版本过旧，不支持 userQuestions 服务');
console.log('3. 弹框被 UI 层拦截或权限不足');
console.log('4. 存在运行时异常但被静默吞掉');
console.log('\n建议添加运行时日志来进一步定位：');
console.log('- 在 UserQuestionsAdapter.available() 添加 console.log');
console.log('- 在 CaptureRequirement.captureRequirement() 开始处添加日志');
console.log('- 在 GateAwareQuestions.ask() 添加日志');
console.log('\n如果某些检查失败，请按照失败项修复代码。');

console.log('\n=== 诊断完成 ===');
