---
serves: FR-3, FR-4, FR-5, FR-6, FR-7
---

# REQ-261005122347-e07a · 用例设计

## 1. UC-1 主用例：需求分析节点要做原型（serves: FR-3, FR-4）

**参与者**：人（提需求）/ 主 agent（窗口）/ 原型 subagent。

```
人：提一个有界面的需求
 │
 ├─ 主 agent 在 brainstorming 注入里看到「原型工作原则」节
 │    └─ 判定：本次会产生界面/交互产物 → 要做原型
 │
 ├─ ① 调 reqboard_skill_install()      → { root, searchScript, python }
 ├─ ② 派 subagent，prompt = 骨架 + 上述路径 + 本次需求摘要
 │        └─ 红线：不调 reqboard_*、不改状态、只写 prototype/
 │
 ├─ ③ subagent：读 <root>/ui-ux-pro-max/SKILL.md
 │              跑 search.py --design-system（或分域检索）
 │              写 docs/requirements/<REQ>/prototype/<文件>
 │
 ├─ ④ subagent 返回 { files, note, queries }
 └─ ⑤ 主 agent 把原型摘要进需求文档/回复，人看原型提意见
```

**成功判据**：`prototype/` 下有产出文件；子代理返回里带查询词或 `unretrieved`；
主 agent 回复能说清"这次原型按哪份 skill、哪次查询做的"。

**为什么必须派 subagent**（而不是主 agent 自己写）：① 准则与检索成本不占主 agent 每轮预算
（需求 E-3：heavy 已用 15,456 / 预算 24,000）；② 原型是独立交付物，失败不污染主上下文。

## 2. UC-2 降级：Python 缺失（serves: FR-5）

```
reqboard_skill_install() → { python: { found: false } }
        │
        ├─ 投放照常成功（资产仍在盘上）
        ├─ subagent 仍读 SKILL.md（优先级表 / references/quick-reference.md 是纯 Markdown，不需要 Python）
        └─ 回复必须写：「本轮未做数据库检索，以下为通用默认」
```

**禁止**：把 0 结果或"未检索"包装成检索结果（上游 `SKILL.md` 同名纪律；TC-14 守着）。

## 3. UC-3 降级：投放失败 / 资产缺失（serves: FR-6）

| 情形 | 行为 |
|---|---|
| `<pkg>/skills/<name>` 不在盘（装机漏打包） | 返回 `REQBOARD_SKILLS_ASSET_MISSING` + 缺失路径；**不**静默少投几个 |
| 写盘失败（只读目录/磁盘满） | 返回 `REQBOARD_SKILLS_WRITE_FAILED` + 首个失败路径；临时目录清理，目标目录零改动 |
| 投放根不可写且无 `root` 覆盖 | 同上，并在回执里给"可用 `root` 参数指定可写目录"的指引 |

**不允许**的收尾方式："应该没问题，先跑吧"（本仓失败要响亮的铁律）。

## 4. UC-4 幂等与重复使用（serves: FR-6）

- 同一工作区第二次调 `install`：`sha256` 全等 → `reused=true`，**不重写**（mtime 不变，TC-5）。
- 版本升级（插件换版）→ `manifest.plugin.version` 不同 → 覆盖同名文件；用户新增文件不动。
- 目录被手工删了一半 → manifest 校验不通过 → 整目录重建（不拼半份）。

## 5. UC-5 关闭开关 / 回滚（serves: FR-7）

```
skills.enabled = false
  ├─ 注入：不加「原型工作原则」节（与改造前逐字节一致）
  └─ 工具：返回 REQBOARD_SKILLS_DISABLED，不写盘
```

物理回滚：`rm -rf <workspace>/.dsh/skills`（插件不留任何台账状态，无需迁移脚本）。

## 6. 本需求明确不覆盖的用例（边界，见需求文档「明确不做」）（serves: FR-3, FR-4）

1. **implementing / 子卡链**里使用该 skill —— 本期不接线。
2. **设置界面**里配置 skill 源 / 切换 skill —— 后续需求。
3. **其余 6 个 skill 的具体用法** —— 本期只负责"收录 + 可投放"，不为它们各写注入节。
4. **子代理越出工作区读插件包路径** —— 人已裁定走"投放"主路径，本用例集不覆盖该路径。

## 7. 人可复核的端到端清单（serves: FR-1）

- [ ] `<pkg>/skills/PROVENANCE.md` 能对上上游 commit 与 MIT 许可
- [ ] `<ws>/.dsh/skills/.manifest.json` 的 `files` 与盘上文件逐一对应
- [ ] `python3 <ws>/.dsh/skills/ui-ux-pro-max/scripts/search.py "internal analytics dashboard" --design-system` 有真实输出
- [ ] brainstorming 注入文本里**只有引用**，没有准则全文（人工目检 + TC-12 佐证）
