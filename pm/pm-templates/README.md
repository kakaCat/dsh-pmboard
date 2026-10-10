# pm-templates

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

资产包：文档模板目录（templates/**）。运行期由根包 TemplateRoot 以双根解析（包内优先）。

## 允许依赖（分层 `L3`）

（无：本包不得依赖任何 workspace 包）

## 边界

零 import（纯资产）；内容与搬迁前逐字节一致。

## 测试

```bash
npx vitest run pm/pm-templates/tests
```
