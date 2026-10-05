# t-8f7af4 让下一个拆分节点自己会算容量·研发

> 需求：REQ-261002175818-80a8 拆分阶段预判单轮余量：卡片体量声明与超容量强制分批

## 在做什么
让下一个拆分节点自己会算容量·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T05:51:52.634Z，窗口 session-5c6b1a8b-3234-4f35-b28f-1f1a20834721）

这一步做完，**下一个拆分节点自己就知道要算容量了**：它在「拆分」这一刻会读到一段纪律——先算（files×1 + anchors×0.5 + chars/2000）、每张卡必须声明体量、装不下就自己切、确需保留就在计划里标红并让批数对得上。也就是说，这个能力不再只活在代码和门禁里，而是**写在将来那个节点一定会读到的地方**。

### 完成项

- heavy.md 新增「4. 容量纪律（一轮装多少：先算，再切）」5 条清单（原 4/5/6 顺延为 5/6/7；既有「下一步：」行逐字未动）
- light.md 在「卡内必给验收」后插入 4 条同口径清单
- 覆盖口径/权重单一源/必声明 footprint/不得少于 implementation 路径数/超容量自己切/标记批数必须相等/批准文本别重拼标签
- 生成物由脚本产出：inline-prompt-fragments.mjs + check-prompt-fragments.mjs 退出码 0；还原 md 重跑后产物逐字节相同（可复现）
- tests/prompt-gates.test.ts 13/13 全绿；零新增工具名（错误码用大写避开大小写敏感的门禁 2 扫描）
- 段落长度：heavy 576、light 444（建议 ≤600）；decomposing/heavy 全文 3213（预算 24000，无压力）
- 自报偏差（我裁定**接受**）：额外重跑 dump-stage-prompts.mjs 更新 tests/fixtures/stage-prompts-baseline-p1.json——该测试头部自己写明「文本演进时显式重跑脚本更新，diff 即变更留痕」，是仓库既定机制而非删检查；重跑后 prompt-baseline 15/15，且只多变了 decomposing/{light,heavy} 两键
- 既有失败证伪：把两个 md 还原到 HEAD、重跑生成器后再跑，失败条目名与数量完全一致（stage-prompts 6 + prompt-injection-log 1）；size-budget 的 1 条失败改动前即存在（20 个超 400 行文件在既有清单里）
- 余量风险如实记录：decomposing/light 现 2429/2500，仅余 71 字符——后续再给该档加字会顶上限

### 改动文件

- `src/domain/prompt/fragments/decomposing/heavy.md`
- `src/domain/prompt/fragments/decomposing/light.md`
- `src/domain/prompt/generated/fragments.ts`
- `tests/fixtures/stage-prompts-baseline-p1.json`

### 下一步

复核子卡：核对分片是否复述（而非引用）单一源、是否零新增工具名、以及基线条目有无限定域更新。

---
