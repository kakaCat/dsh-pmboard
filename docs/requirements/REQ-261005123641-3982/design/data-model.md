---
serves: [FR-1, FR-2, FR-5]
---

# 数据模型设计（REQ-261005123641-3982）

> 结论先行：**不改 schema、不迁移、不回填**。本次修的是「谁说了算」，不是「存什么」。

## 权威字段：`RequirementRecord.workspaceRoot` `serves: FR-1, FR-2`

| 项 | 定稿 |
|---|---|
| 类型 / 必填 | `string`（绝对路径）/ **可选**（存量记录缺省）——**不变** |
| 语义 | 该需求所有文件操作（docs / queue / 产物 / 任务卡文档）的根；**写侧的唯一权威** |
| 可变性 | 一经落库不可变（沿用既有承诺）；本次**不新增**变更入口 |
| 取值来源 | 立项时选定（capture 第 5 问解析结果 / create 的 `workspace_root`），即「本次真实会写进去的工作区」 |
| 定位方式 | **按 REQ id 取记录**（`requirementStore.get(reqId)`）→ 读它的 `workspaceRoot`；这是「按需求 id 区分」的落地形态 |

## 降级为「缓存」的字段：共享单例的根 `serves: FR-1`

| 现状 | 改后 |
|---|---|
| `deps.docs`（`FileDocRepository.root`，[FileDocRepository.ts:30](../../../../../src/adapters/FileDocRepository.ts)）与 `queueRepo` 的根，被所有窗口/看板共同读写（last-writer-wins） | **语义降级为缓存**：只被「校正」，**不得作为判定输入**（任何新代码都不得用它的当前值去判「这属于哪个项目」） |
| `ensureWritableProjectRoot` 用它当「实际会写的根」 | 判定输入改为 `record.workspaceRoot`；单例只被校正 + 复核（复核失败 = 校正失效的最后防线） |

> 文档层面新增一条口径（写进 `docs/architecture/` 的相应篇章，归档时申报）：
> **「按需求 id 定位记录 → 记录自己声明根」是唯一的项目归属判定口径；进程内共享根只是缓存。**

## 缺失与异常值的处理 `serves: FR-2`

| 记录状态 | 读侧（现状，保持） | 写侧（本次定稿） |
|---|---|---|
| `workspaceRoot` 有值、绝对、目录存在 | 用它 | 校正到它 → 写 |
| `workspaceRoot` 有值但非绝对 / 不存在 / 不可读 | 降级到会话 cwd + warn | **拒绝**（`REQBOARD_INVALID_WORKSPACE`），**不降级**（降级 = 写到别的项目） |
| `workspaceRoot` 缺省（存量） | 解析链回落会话 `header.cwd` | 回落调用窗口 cwd，`attributed=false` 并标注；无 cwd → 不判（返回 `undefined`） |
| `workspaceRoot` 指向符号链接 | 形状比较可能误判（现状 `sameProjectRoot` 不注入 realpath） | 校正后两侧同源，天然一致；**不引入** realpath 依赖（application 层禁 `node:`） |

## 兼容、迁移与回滚 `serves: FR-5`

- **兼容**：字段与类型零变化 ⇒ 存量台账（`~/.dsh/reqboard/requirements/<REQ>/record.json`）原样可读；
  旧调用方（第 3 参不传）行为与判定结果在**单窗口**场景下逐字一致（多窗口场景由误判变正确）。
- **迁移**：无。不回填 `workspaceId`、不改 `docBasePath`、不动 `queue.json`。
- **半截态修复**：存量「已批准但任务卡未落库」的需求（如 REQ-261005122347-e07a）不需要改数据，
  修复后手动 `reqboard_decompose` 重试即可落库。
- **回滚**：还原 `ensureWritableProjectRoot` / `assertWritableRequirementProject` 两个函数体即可
  （纯代码回滚，无数据回滚需求）；回滚后旧误判行为重现，不产生脏数据。
