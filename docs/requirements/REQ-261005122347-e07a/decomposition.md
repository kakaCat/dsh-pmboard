# REQ-261005122347-e07a · 拆分计划（decomposition）

> 目标：把设计落成 5 张卡。**契约先行**（资产清单 + manifest/端口先定死），实现卡 depends_on 它。
> 容量口径：`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 16 DU/轮（单一源 `src/domain/limits.ts`）。

## 1. 代码层面改动盘点

**新增**

| 路径 | 说明 |
|---|---|
| `scripts/vendor-skills.mjs` | 收录/裁剪/算 sha256/写 `PROVENANCE.md` 的可复现脚本（含 `--check` 漂移检测） |
| `skills/**`（7 个 skill，裁剪后 ≤5MB） | vendor 资产（源）；由上一行脚本产出 |
| `skills/PROVENANCE.md` | 来源 / MIT / upstream commit / 裁剪清单 / sha256（front-matter 机器可读） |
| `src/application/internal/skill-manifest.ts` | manifest 类型 + 构造 + 校验（**纯函数**，零 I/O） |
| `src/application/use-cases/InstallSkills.ts` | 投放用例：清单 → 幂等判定 → 经端口写盘 → 回执 |
| `src/adapters/SkillAssets.ts` | 读 `<pkg>/skills`（列资产 / 读字节 / sha256） |
| `src/adapters/SkillWriter.ts` | 投放写盘（temp 目录 → 逐文件校验 → rename 顶替） |
| `src/adapters/PythonProbe.ts` | 解释器探测（`python3` → `python` → `py -3`），唯一 `child_process` 点 |
| `src/tools/SkillInstallTool/SkillInstallTool.ts` + `prompt.ts` | 工具定义（入参/返回/错误码见设计 interfaces §1） |
| `tests/skills-assets.test.ts` / `skills-materialize.test.ts` / `skills-injection.test.ts` / `skills-provenance.test.ts` | 四个新用例文件（TC-1…TC-16） |

**修改**

| 路径 | 改什么 |
|---|---|
| `package.json` | `files` 增 `"skills"` |
| `src/plugin-config.ts` | 新增 `skills?: { enabled?: boolean; root?: string }` + 解析函数（非法值装配期抛错） |
| `src/application/ports.ts` | 新增 `SkillAssetPort` / `SkillInstallPort`（含 `probePython`）两个端口 |
| `src/index.ts` | 装配两个适配器 + `toolsCtx.tools.register(defineSkillInstallTool(...))` + 工具清单字符串（`:862` 那行） |
| `src/domain/prompt/fragments/brainstorming/feature.md` | **追加**「原型工作原则」节（≤1200 字符；类型档 = 可裁 priority 10，天然满足"非 floor"） |
| `src/domain/prompt/generated/fragments.ts` | C-16 重生成（**生成物，不手改**） |
| `tests/fixtures/stage-prompts-baseline-p1.json` | `dump-stage-prompts.mjs` 重生成（P1 基线显式更新） |
| `docs/knowledge/entries/kb-00xx.md` + `INDEX.md` | 新增一条决策条目（kb:build 产出）+ `pnpm kb:check` |

**删除**：无（本需求不删既有代码；裁剪只作用于新增的 vendor 资产内部）。

## 2. 任务表

| key | 标题 | phase | side | depends_on | 承接 |
|---|---|---|---|---|---|
| t1 | 收录 7 个 skill 资产并固化版本指纹 | implement | backend | — | FR-1, FR-2, FR-8 |
| t2 | 定义资产/manifest 契约与 skills 配置开关 | implement | backend | — | FR-2, FR-7, FR-8 |
| t3 | 实现投放工具 reqboard_skill_install | implement | backend | t1, t2 | FR-1, FR-5, FR-6, FR-7 |
| t4 | brainstorming 注入「原型工作原则」节 | implement | backend | t1 | FR-3, FR-4, FR-7 |
| t5 | 回归收尾：知识层条目 + 反向演练 + 全量门禁 | test | doc | t3, t4 | FR-1…FR-8 |

### t1 · 收录 7 个 skill 资产并固化版本指纹

- **implementation**：写 `scripts/vendor-skills.mjs`：从上游签出目录（`--from <dir>`，缺省 `/tmp/uupm/repo`）
  拷 `.claude/skills/{ui-ux-pro-max,ui-styling,design,design-system,brand,slides,banner-design}` 到 `<pkg>/skills/`；
  按裁剪清单排除 `**/scripts/tests/`、`ui-styling/canvas-fonts/`、
  `ui-ux-pro-max/data/phosphor-icons-upstream.json`、`data/google-font-licenses.json`；
  对每个 `SKILL.md` 与 `scripts/**/*.py` 算 `sha256`；写出 `skills/PROVENANCE.md`（front-matter = 设计 data-model §1 的形状）。
  `--check` 模式：重算并与既有 `PROVENANCE.md` 比对，不一致即 exit 1（漂移检测，供 CI/收尾用）。
  改 `package.json` 的 `files` 增 `"skills"`。
- **acceptance**：① `node scripts/vendor-skills.mjs` 退出码 0 且 `skills/` 下 7 个目录齐；
  ② `du -sm skills | cut -f1` ≤ 5；③ `node scripts/vendor-skills.mjs --check` 退出码 0；
  ④ 手改 `skills/ui-ux-pro-max/SKILL.md` 一个字节 → `--check` 退出码 1（**反向必红**，改回）；
  ⑤ `node -e "const p=require('./package.json');process.exit(p.files.includes('skills')?0:1)"` 退出码 0。
- **footprint**：files 4 / anchors 5 / chars 1400

### t2 · 定义资产/manifest 契约与 skills 配置开关

- **implementation**：`src/application/internal/skill-manifest.ts`——`SkillManifestV1` 类型、`buildManifest()`、
  `verifyManifest(files, manifest)`（返回不一致清单）；纯函数、零 I/O、零 `node:`。
  `src/application/ports.ts`——`SkillAssetPort { listSkills(); readAsset(rel); }`、
  `SkillInstallPort { probePython(); writeTree(root, files); readTree(root); }`（形状按设计 interfaces §1 回执需要）。
  `src/plugin-config.ts`——`skillsSettings(config)`：`enabled` 缺省 true（非布尔抛 `REQBOARD_SKILLS_CONFIG_INVALID`）、
  `root` 缺省由调用方给会话工作区。
- **acceptance**：① `npx vitest run tests/skills-provenance.test.ts` 全绿（含 TC-15 内容篡改必红、TC-16 manifest 篡改必红）；
  ② `npx vitest run tests/layer-boundary.test.ts` 全绿（application 层不 import `node:`）；
  ③ `node -e` 断言 `skillsSettings({skills:{enabled:'no'}})` 抛错含 `REQBOARD_SKILLS_CONFIG_INVALID`。
- **footprint**：files 4 / anchors 4 / chars 1200

### t3 · 实现投放工具 reqboard_skill_install

- **implementation**：`src/application/use-cases/InstallSkills.ts`（决策：全等→reused；否则建待写清单；不碰盘）；
  `src/adapters/SkillAssets.ts`（读 `<pkg>/skills`）、`src/adapters/SkillWriter.ts`（写 `<root>.tmp-<id>` →
  逐文件 sha256 校验 → rename 顶替 → 失败清理）、`src/adapters/PythonProbe.ts`（顺序探测 + 版本）；
  `src/tools/SkillInstallTool/`（schema/文案/错误码映射，长文本写法沿本仓约定）；
  `src/index.ts` 装配 + 注册 + 工具清单字符串。
- **acceptance**：① `npx vitest run tests/skills-materialize.test.ts tests/skills-assets.test.ts` 全绿（TC-1…TC-9）；
  ② 连跑两次 `install` → 第二次 `reused=true` 且盘上 mtime 不变；
  ③ 把 root 指向只读目录 → `REQBOARD_SKILLS_WRITE_FAILED` 且**无 `.tmp-*` 残留、目标目录不存在**；
  ④ `skills.enabled=false` → `REQBOARD_SKILLS_DISABLED` 且不写盘；
  ⑤ 实跑回执含 `python.found/version` 与 `searchScript` 绝对路径，且该路径 `python3 … --design-system` 退出码 0。
- **footprint**：files 8 / anchors 7 / chars 2600

### t4 · brainstorming 注入「原型工作原则」节

- **implementation**：把设计 interfaces §2 的逐字稿追加到
  `src/domain/prompt/fragments/brainstorming/feature.md` 末尾（**不改** heavy/light/overrides 与 vendor 镜像）；
  跑 `node scripts/inline-prompt-fragments.mjs` 重生成产物；跑 `node scripts/dump-stage-prompts.mjs` 更新 P1 基线；
  新增 `tests/skills-injection.test.ts`（TC-10…TC-14）。
- **acceptance**：① `node scripts/check-prompt-fragments.mjs` 退出码 0；
  ② `npx vitest run tests/skills-injection.test.ts tests/prompt-baseline.test.ts tests/prompt-cost.test.ts` 全绿；
  ③ 注入含 `必须派 subagent`、`SKILL.md`、`search.py`、`--design-system`、`prototype/`、`reqboard_` 禁用声明，
  且**不含** `${CLAUDE_PLUGIN_ROOT}`；
  ④ 把 budget 人为压到极小 → 该节被裁而人工门/红旗段仍在（**证明非 floor**，反向演练）；
  ⑤ brainstorming(heavy) `charCount ≤ 24000` 且 `overBudget` 为空。
- **footprint**：files 4 / anchors 6 / chars 2200

### t5 · 回归收尾：知识层条目 + 反向演练 + 全量门禁

- **implementation**：新增 `docs/knowledge/entries/kb-00xx.md`（决策：资产收录 + 投放主路径 + 只给引用），
  跑 `pnpm kb:build` 更新 `INDEX.md`；把两处反向演练（t1 的 --check、t4 的非 floor）结论写 `notes/`；
  跑全量回归与基线比对。
- **acceptance**：① `pnpm kb:check` 退出码 0；② `npx tsc --noEmit` 新增错误 0；
  ③ `npx vitest run tests/reqboard tests/application tests/http` 失败数 ≤ 开工基线（开工实测写入卡）；
  ④ `notes/` 下两份演练记录在盘且各含"删掉断言 → 用例必红"的记录。
- **footprint**：files 3 / anchors 4 / chars 1000

## 3. 容量核算（16 DU/轮）

| key | files | anchors | chars | detailUnits | 判定 |
|---|---|---|---|---|---|
| t1 | 4 | 5 | 1400 | 4 + 2.5 + 0.7 = **7.2** | ✓ |
| t2 | 4 | 4 | 1200 | 4 + 2.0 + 0.6 = **6.6** | ✓ |
| t3 | 8 | 7 | 2600 | 8 + 3.5 + 1.3 = **12.8** | ✓ |
| t4 | 4 | 6 | 2200 | 4 + 3.0 + 1.1 = **8.1** | ✓ |
| t5 | 3 | 4 | 1000 | 3 + 2.0 + 0.5 = **5.5** | ✓ |

无超容量卡（均 ≤16 DU），不需要分批标记。

## 4. 依赖与批次

```
批 1（并行）: t1 资产指纹      t2 契约/开关
                   \             /
批 2（并行）:        t3 投放工具    t4 注入节
                        \        /
批 3:                     t5 回归收尾
```

`t3` 的 `depends_on: [t1, t2]`；`t4` 只依赖 `t1`（节文本引用的是资产路径与工具名，二者在 t1/t2 已定形）；
`t5` 依赖 `t3, t4`。前向引用不存在。

## 5. 验收口径（本计划的整体判据）

```bash
node scripts/vendor-skills.mjs --check                     # 资产指纹无漂移
node scripts/check-prompt-fragments.mjs                    # C-17 片段↔产物一致
npx vitest run tests/skills-assets.test.ts tests/skills-materialize.test.ts \
               tests/skills-injection.test.ts tests/skills-provenance.test.ts \
               tests/prompt-baseline.test.ts tests/prompt-cost.test.ts tests/layer-boundary.test.ts
npx tsc --noEmit 2>&1 | grep -c 'error TS'                  # ≤ 开工基线
python3 <ws>/.dsh/skills/ui-ux-pro-max/scripts/search.py "internal analytics dashboard" --design-system
```

## 6. 风险与迁移

1. **资产体积**：裁剪后 ~4.5MB（不含 5.5MB 字体）；若人要求加回字体，`files` 与体积断言同步放宽（t1 的 ②）。
2. **投放根的 .gitignore 写入**：只写投放根内部，不碰用户既有文件；若用户项目已存在 `.dsh/skills/.gitignore`，
   以"内容为 `*`"为准覆盖并留痕回执。
3. **旧调用方兼容**：新增工具与新增注入节都是**纯增量**；`skills.enabled=false` 一键回到改造前（无迁移脚本、无台账变更）。
4. **上游许可**：裁剪掉的两个 JSON 与字体目录若日后加回，必须先补许可留痕（设计 architecture §5 留白 1）。
