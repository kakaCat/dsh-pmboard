#!/bin/bash
# reqboard_capture 弹框功能快速验证脚本

echo "=== reqboard_capture 弹框功能验证 ==="
echo ""

# 1. 检查构建是否成功
echo "【步骤 1】检查构建产物"
if [ -f "dist/index.mjs" ]; then
    echo "  ✓ dist/index.mjs 存在"
    BUILD_SIZE=$(wc -c < dist/index.mjs)
    echo "    文件大小: $BUILD_SIZE bytes"
else
    echo "  ✗ dist/index.mjs 不存在"
    echo "    请先运行: pnpm build"
    exit 1
fi

# 2. 检查调试日志是否被编译进去
echo ""
echo "【步骤 2】检查调试日志是否存在于构建产物中"
if grep -q "reqboard DEBUG" dist/index.mjs; then
    echo "  ✓ 调试日志已编译进构建产物"
    DEBUG_COUNT=$(grep -c "reqboard DEBUG" dist/index.mjs)
    echo "    找到 $DEBUG_COUNT 处调试日志"
else
    echo "  ✗ 调试日志未找到"
    echo "    这可能意味着构建时被优化掉了"
fi

# 3. 检查关键函数是否存在
echo ""
echo "【步骤 3】检查关键函数"
FUNCTIONS=(
    "UserQuestionsAdapter"
    "GateAwareQuestions"
    "captureRequirement"
    "buildCaptureIntentQuestions"
    "askWithBudget"
)

for func in "${FUNCTIONS[@]}"; do
    if grep -q "$func" dist/index.mjs; then
        echo "  ✓ $func"
    else
        echo "  ✗ $func - 未找到"
    fi
done

# 4. 给出下一步指示
echo ""
echo "【下一步操作】"
echo "1. 在 DSH 中重新加载插件"
echo "2. 打开浏览器开发者工具（Console）"
echo "3. 在一个未绑定需求的窗口中，让 agent 识别需要立项的工作"
echo "4. 观察控制台中的 [reqboard DEBUG] 日志"
echo ""
echo "【预期日志顺序】"
echo "  [reqboard DEBUG] CaptureRequirement: 检查弹框通道可用性"
echo "  [reqboard DEBUG] GateAwareQuestions.available(): true/false"
echo "  [reqboard DEBUG] UserQuestionsAdapter.available(): { ... }"
echo "  [reqboard DEBUG] CaptureRequirement: 弹框通道可用，准备构建问题"
echo "  [reqboard DEBUG] 准备第一段弹框: { ... }"
echo "  [reqboard DEBUG] askOrFail 被调用: { ... }"
echo "  [reqboard DEBUG] 调用 askWithBudget..."
echo "  [reqboard DEBUG] GateAwareQuestions.ask() 被调用: { ... }"
echo "  [reqboard DEBUG] UserQuestionsAdapter.ask() 被调用: { ... }"
echo "  [reqboard DEBUG] 调用 svc.ask()..."
echo "  [reqboard DEBUG] svc.ask() 返回: { ... }"
echo "  [reqboard DEBUG] GateAwareQuestions.ask() 收到答案: { ... }"
echo "  [reqboard DEBUG] askWithBudget 返回: { kind: 'answered' }"
echo ""
echo "【如果日志在某一步停止】"
echo "  → 那一步就是问题所在，参考 docs/troubleshooting/capture-failure-investigation.md"
echo ""
echo "=== 验证完成 ==="
