# 架构设计 <!-- serves: FR-1 -->

## 问题定位 <!-- serves: FR-1 -->

PM 插件（dsh-pmboard）依赖 DSH 的 `userQuestions` 服务来实现弹框功能，但客户端配置中未声明此依赖。

## 修复方案 <!-- serves: FR-1 -->

在 `package.json` 的客户端配置中添加服务依赖声明：

```json
"dsh": {
  "client": {
    "inject": [
      "slots",
      "sessions", 
      "workspaces",
      "layout",
      "userQuestions"  // 添加此行
    ]
  }
}
```

## 架构影响 <!-- serves: FR-1 -->

- **修改范围**：配置文件
- **影响组件**：客户端插件加载器
- **依赖关系**：显式声明对 `userQuestions` 服务的依赖
- **向后兼容**：完全兼容，仅恢复原有功能
