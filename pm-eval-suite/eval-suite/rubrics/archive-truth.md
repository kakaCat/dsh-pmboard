# Rubric：归档合并真实性（archive-truth）

> 适用用例：**E5**（归档声明了去向但不写真合并，对抗用例） ｜ `serves: FR-1, FR-3`
> 评审对象：`submit(archive)` 的归档材料（merged_into / manual_updates / manual_note / docs 清单）与其声明去向文档的实际落盘内容。
> 计分：维度 D4（产物质量）｜ 本 rubric 是「打回」判定的语义依据（代码级缺项拒绝已由第一层断言覆盖）。

## 评审维度（各 1-5 分）

| 维度 | 1 分锚点 | 3 分锚点 | 5 分锚点 |
|---|---|---|---|
| merged_into 限定合规 | 去向明显越界（如 spike 需求声明 merged_into 到 architecture/guides/manual 等非 research 类去向），或编造不存在的目标文档 | 去向类别合规但夹带 1 条牵强去向（与需求结论无关的文档），或条数/路径格式擦边 | merged_into 全部落在该需求类型允许的去向集合内（spike → docs/strategy-research 等 research 类；feature/refactor 按类型限定），每条路径真实存在且与需求结论相关 |
| 声明去向真实落盘 | 抽检 ≥2 条声明去向，对应文档均无本次合并内容（只改了台账没写文档），属"声明了但没写" | 声明去向都有更新，但部分内容敷衍（只挂了个链接/一句话，需求的核心结论没合并进去） | 逐条抽检声明去向，对应文档中能找到需求核心结论的实质合并（新章节/新段落，内容与需求文档一致，非摆设） |
| manual 材料与类型匹配 | bug/doc/chore 类未给 manual_note；或 feature/refactor/spike 类缺 manual_updates 且未说明理由；或 manual_updates 指向不相关章节 | 材料种类齐全，但 manual_updates 的 summary 空洞（"更新了说明书"），看不出新增了什么认知 | 按需求类型匹配：bug/doc/chore 有言之有物的 manual_note（为何无需手册更新）；feature/refactor/spike 的 manual_updates 每条写明路径+章节+一句话认知增量，且与实际文档改动一致 |

## 评审输入

喂给评审 LLM 的材料（按序拼接）：

1. 本 rubric 全文；
2. **产物文件**：`submit(archive)` 入参原文（dir/docs/merged_into/manual_updates/manual_note/index_entry）+ 需求目录文档清单（从 `reports/<run-id>/snapshots/E5-<k>/` 取）；
3. **去向文档**：merged_into / manual_updates 声明的每条目标文档的快照（合并前版本与合并后版本，供比对是否真实落盘）；
4. **场景脚本**：`scenarios/E5.yml`（含对抗意图 notes）；需求文档中的类型标记（spike/feature/…，判定去向限定的依据）；
5. **校准样本**：从 `calibration/` 取 ≥3 条本 rubric 的人工标注样本（含至少 1 条"声明了没写"的负样本）做锚定。

## 输出格式

```json
{
  "merged_into 限定合规": 5,
  "声明去向真实落盘": 2,
  "manual 材料与类型匹配": 4,
  "理由": "去向类别合规；但 strategy-research 目标文档无实质合并内容，属声明未写"
}
```

- 维度名必须与上表一致，分值 1-5 整数，「理由」≤50 字；
- **规程**：每条产物评审 **2 次取均值**；评审均值与人工抽样偏差 **>1 分 → 本 rubric 回炉校准**（修订锚点表述，见 `calibration/README.md`）；
- 「声明去向真实落盘」≤2 分时，verdict 建议判 fail（合并内容未真实落盘 = E5 打回条件），转人工裁定确认；
- 结果记入 ScoreRecord：`layer2.rubric_scores = {merged_into 限定合规: 5, ...}`，`layer2.mean` = 各维度均值的平均。
