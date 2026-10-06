---
serves: FR-2, FR-7, FR-8
---

# REQ-261005122347-e07a · 数据模型设计

> 本需求**不改台账 schema**（不需要「重建库」那个动作）：唯一新增的持久化数据是
> **插件包内资产目录**与**投放目录里的两份元数据文件**。

## 1. 资产清单（包内，serves: FR-2）

```jsonc
// <pkg>/skills/PROVENANCE.md 里以 YAML front-matter 承载机器可读部分
{
  "source": "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill",
  "license": "MIT",
  "commit": "477bcb28c9812b385cb51a4605ddf30d7b2266e2",  // 实测取得
  "fetchedAt": "2026-10-05",
  "skills": ["ui-ux-pro-max","ui-styling","design","design-system","brand","slides","banner-design"],
  "trimmed": [
    { "glob": "**/scripts/tests/", "bytes": 266400, "why": "上游自测，非运行时资产" },
    { "glob": "ui-styling/canvas-fonts/", "bytes": 5767168, "why": "字体二进制，非检索/规则依赖" },
    { "glob": "ui-ux-pro-max/data/phosphor-icons-upstream.json", "bytes": 824320, "why": "上游图标目录刷新用（实测删后检索仍可用）" },
    { "glob": "ui-ux-pro-max/data/google-font-licenses.json", "bytes": 433152, "why": "许可展示用（同上）" }
  ],
  "sha256": { "ui-ux-pro-max/SKILL.md": "<hex>", "ui-ux-pro-max/scripts/search.py": "<hex>" }
}
```

**约束**：

- `skills[]` 与 `<pkg>/skills/` 下的一级目录**必须双向一致**（用例断言：目录多一个/少一个都红）——
  防"收录了但没登记"与"登记了但没打包"两类漂移。
- `sha256` 至少覆盖每个 skill 的 `SKILL.md` 与所有 `scripts/**/*.py`；全量哈希可选（体积大）。
- 总体积上限 **5MB**（用例断言 `<pkg>/skills` 磁盘占用，超限即裁剪失效）。

## 2. 投放侧元数据（用户工作区，serves: FR-2, FR-8）

```jsonc
// <workspace>/.dsh/skills/.manifest.json
{
  "schema": 1,
  "plugin": { "name": "dsh-pmboard", "version": "0.1.0", "build": "4df1d51d2e19" },
  "source": { "commit": "477bcb28…", "license": "MIT" },
  "materializedAt": 1791174227789,
  "root": "/abs/workspace/.dsh/skills",
  "files": { "ui-ux-pro-max/SKILL.md": { "sha256": "<hex>", "bytes": 15969 } },
  "trimmed": ["ui-styling/canvas-fonts/"],
  "searchScript": "ui-ux-pro-max/scripts/search.py"
}
```

| 字段 | 类型 | 约束 |
|---|---|---|
| `schema` | number | 常量 `1`；将来形态变更即 +1 并写迁移 |
| `files[*].sha256` | string | 64 位 hex；**幂等判据**：全等 → `reused=true` 不重写 |
| `files[*].bytes` | number | 与盘上实际字节一致（用例抽查） |
| `searchScript` | string | **相对 root** 的路径；绝对路径由工具回执现算，不落盘（防目录搬家后失效） |
| `materializedAt` | number | 仅记录，不参与判定 |

**兼容与迁移（serves: FR-2）**：

- **无台账迁移**：不写需求台账、不新增 `ArtifactKind`（FR-4 已定：原型产物沿用 `notes` 兜底）。
- **`.manifest.json` 缺失或 `schema` 不识别** → 视为"未投放"，整目录重建（只覆盖本插件投放过的同名文件，不删用户新增）。
- **回滚**：`rm -rf <workspace>/.dsh/skills`（无残留状态）；插件配置 `skills.enabled=false` 一键停注入。
- **自忽略**：投放根写 `.gitignore`（内容 `*`）；**不改**用户既有 `.gitignore`。

## 3. 注入节的数据来源（serves: FR-3, FR-7）

注入节**不读盘**（保持 `generated/fragments.ts` 构建期内联的既有纪律，需求 E-1）：
节文本是构建期常量，只有"投放根路径"是运行时由工具回执产生的**会话事实**，
故注入节里写的是"先调 `reqboard_skill_install()` 拿路径"，而不是某个写死的路径。

## 4. 溯源与防漂移（serves: FR-8）

```
上游 commit 477bcb28 ──> <pkg>/skills/** ──sha256──> PROVENANCE.md
                                   │
                                   │ 投放（逐文件校验）
                                   v
                        <ws>/.dsh/skills/** + .manifest.json
```

三条防漂移断言：① 包内资产与 `PROVENANCE.md` 的 `sha256` 一致（内容被手改即红）；
② 投放后盘上文件的 `sha256` 与 manifest 一致（投放半途失败即红）；③ `skills[]` 与目录双向一致（§1）。
