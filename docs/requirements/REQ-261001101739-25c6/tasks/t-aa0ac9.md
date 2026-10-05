# t-aa0ac9 发版门禁：产物归属章 + CSS 分片截断信号

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
给发版加一道硬检查：构建产物里必须带样式归属信息、CSS 分片不能被截断，否则构建直接失败、不许发出去。

## 解决什么问题
「样式全丢」这类事故此前只有发到用户手里才发现——产物里少了关键内容，构建照样成功。这张卡让它在出厂前就暴露：缺归属章或缺 CSS 内容，构建就红。

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
同类事故不可能再静默出厂：构建命令会明确报出「产物缺少样式归属章」或指名哪个 CSS 分片被截断。

验收（跑什么 / 看到什么算过）：
① pnpm build:client → 末行 [verify-client] OK bundle=… 关键符号齐全, 样式归属章在场, CSS 分片完整，退出码 0；② 反例：临时删掉 tag.dataset.plugin = PLUGIN_ID → 同命令非零退出且输出含「产物缺少样式归属章」；③ 反例：临时去掉任一 styles/*.ts 末尾反引号 → 非零退出且指名该分片。

## 实施方案（implementation）
scripts/verify-client-build.mjs：新增 ownership=['dataset.plugin=','dataset.pluginCss='] 检查（缺失非零退出并指名）；把截断信号改挂到 src/client/styles/*.ts（每份以模板字符串收尾）+ 校验 styles.ts 仍含 injectStyles(；补 readdirSync 导入。

## 上游产出摘要（dependsSummary）
- 样式表自带归属章并在工厂执行期注入

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T02:58:30.492Z，窗口 session-96ee4e52-6798-4e5b-b3a3-946152bfaf2a）

发版链路多了一道哨兵：产物缺样式归属信息或 CSS 分片被截断时构建直接失败，坏包再也发不出去。

### 完成项

- verify-client-build.mjs 门禁落地：产物归属章检查 + CSS 分片截断检查 + styles.ts 调用检查
- 正例：pnpm build:client exit 0（bundle=319777，样式归属章在场, CSS 分片完整）
- 反例1：去掉归属章 → 非零退出 +「产物缺少样式归属章」；反例2：截断 styles/token.ts → 非零退出（编译层）+ 门禁脚本指名分片
- 四条子卡（研发/联调/复核/测试）全部 done

### 改动文件

- `scripts/verify-client-build.mjs`

---
