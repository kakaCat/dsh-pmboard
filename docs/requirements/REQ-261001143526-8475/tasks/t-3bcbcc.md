# t-3bcbcc 提示词接入：floor 总纲 + 三阶段各一句·复核

> 需求：REQ-261001143526-8475 技术规范自动沉淀 + 补齐打包/发版工程规范

## 在做什么
提示词接入：floor 总纲 + 三阶段各一句·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/prompt-tiers.test.ts → 40 passed；且 git diff --quiet src/domain/prompt/fragments/common/iron-rules.md 退出码 0（与 HEAD 逐字节一致）

## 汇报 1（2026-10-01T06:54:06.310Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

复核抓到两个会污染基线的地方（改了 vendor 镜像档、floor 撤不干净），都还原了。

### 完成项

- 复核（已改）：第一次误把句子写进 heavy.md（vendor 逐字节镜像档）→ 已从 vendor 还原，改走 heavy/overrides.md
- 复核（已改）：iron-rules 的 floor 追加留有残留 → 已从 HEAD 逐字节还原
- 复核（确认）：三阶段 light 各只增 ~45 字符，未破 2500 上限

### 改动文件

- `src/domain/prompt/fragments/common/iron-rules.md`
- `src/domain/prompt/fragments/brainstorming/heavy.md`
- `src/domain/prompt/fragments/implementing/heavy.md`

### 下一步

测试

---
