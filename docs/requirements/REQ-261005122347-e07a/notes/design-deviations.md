# 实施与设计的偏离清单（复核阶段如实登记）

> 复核口径取自 `design/*.md`。凡与设计字面不同者一律列出，附依据——**没有"无偏离"就直接说无偏离**，
> 不把有偏离写成无偏离。本文件供人在验收时逐条取舍。

## 偏离 1：投放根的整体替换（设计 architecture §2 vs interfaces §1）

- **设计 §2 说**：版本不一致时「只覆盖本插件投放过的同名文件（**不删用户新增**）」。
- **实际实现**：`adapters/SkillWriter.writeTree` 走「临时目录 → 逐文件校验 → `rename` 整体顶替」，
  即投放根会被**整体替换**，用户在该目录里另放的文件会消失。
- **依据**：设计 interfaces §1 对同一动作的规定原文是「先写到 `<root>.tmp-<id>`，逐文件校验 sha256，
  全部通过后 `rename` 顶替……目标目录从头的到尾没被碰过」——两条要求本身互斥（整体 rename 必然替换）。
  且设计 §2 自己把该目录定义为插件**受管目录**（写 `.gitignore(*)`、写明「`rm -rf` 即完全回滚」）。
  取事务性优先：它护的是更坏的失败（混版资产）。
- **影响面**：只在用户手动往 `<工作区>/.dsh/skills/` 放东西时可见。可回滚：本偏离不改任何既有行为。
- **若人否决**：改为「先拷既有内容到临时目录、再覆盖同名文件」，代价是 `readTree` 会看到额外文件而
  使幂等判定永远失败（需同时放宽 `file-extra` 判定）——留作后续需求。

## 偏离 2：`trimmed` 是 5 条，设计示例是 4 条

- **设计 data-model §1** 的示例列了 4 条裁剪规则；实际 `PROVENANCE.md` 是 **5 条**。
- **依据**：新增的第 5 条是 `**/__pycache__/`，并把自测规则由 `**/scripts/tests/` 加宽为
  `**/scripts/**/tests/`。两者都严格落在 FR-1 给这两条规则写明的原因「上游自测，非运行时资产」内，
  且需求全文没有任何一处承诺要携带它们。完整论证与实测数字见 `notes/trim-decision.md`。
- **影响面**：包内少了 99,126 B 的上游自测与字节码缓存；指纹条数 29 → 28。
- **可回滚**：删掉 `scripts/vendor-skills.mjs` 的两行 `EXCLUDES` 重跑即可。

## 偏离 3：不传 `requirement_id` 时不强制窗口绑定（设计 interfaces §1）

- **设计说**：`requirement_id` 缺省 = 本窗口绑定需求，错误码含 `REQBOARD_NOT_BOUND_TO_WINDOW`。
- **实际实现**：**显式**传了 `requirement_id` 就必须是本窗口绑定的进行中需求（该错误码照常返回）；
  **不传**则不要求绑定，直接用会话工作区。
- **依据**：投放是「把资产铺到会话工作区」，与需求推进无关。硬要绑定会让「还没立项就想先铺资产」
  这一正当用法被无谓挡掉，而该工具的使用者是主 agent，未必总在需求流里。
- **影响面**：只放宽，不收紧；不改变任何既有工具行为。

## 偏离 4：`SkillAssetPort` 的方法数（拆分计划 t2 卡片 vs 实际）- **卡片说**：`SkillAssetPort { listSkills(); readAsset(rel); }`（2 个方法）。
- **实际实现**：`listSkills()` / `listFiles(skill)` / `readAsset(rel)` / `readProvenance()` / `rootDir()`。
- **依据**：用例必须能枚举「某 skill 下有哪些文件」才能建待写清单；只给 `listSkills()` 就得让
  application 层去猜文件名（把目录形状漏进用例层）。`readProvenance` 是 FR-8 溯源链所需
  （投放清单要记上游 commit）。三者都属「端口要服务用例」的必要面。
- **影响面**：端口是新增的，无既有调用方。

## 偏离 5：注入节的落点从类型档改为「可裁难度档槽」（**已经人裁定**）

- **拆分计划 t4 卡片说**：把逐字稿追加到 `src/domain/prompt/fragments/brainstorming/feature.md` 末尾。
- **实际实现**：新增片段约定 `<stage>/<difficulty>-extra.md`（priority=10，只被**同难度**的路由壳
  include），本节落在 `fragments/brainstorming/heavy-extra.md`，**只有 heavy 有**。
- **依据**：类型档同时被 light 与 heavy 命中，而 light 有 2500 字符上限（`tests/prompt-tiers.test.ts`）；
  按计划追加后 light(feature) 实测 3109 > 2500，既有不变量必红。2026-10-05 就三选项（新增 heavy 专属可裁槽 /
  提高 light 上限 / 把本节压到 556 字符以内）请人裁定，人选**新增可裁槽**。
  完整论证与数字见 `notes/nonfloor-drill.md`。
- **影响面**：动到共享的片段生成器（新增一条文件命名约定 + 路由壳 include 一行）。
  既有片段与既有路由一律未动；不触碰 `router.ts` 的算法与 `CATEGORIES`/`PROMPT_STAGES` 受控枚举。
- **为什么命名是两段**：本仓三段 id 被「路由壳（text 空 + include）」占用，
  `resolveFragmentRef` 会把任何三段非 `overrides` 的 id 判成壳；用三段会让本节在客户端被渲染成壳。
- **可回滚**：删掉 `heavy-extra.md` 与生成器里那两处即可，无存量数据受影响。

## 明确**未偏离**的项

- 注入链一行未改（`resolveStagePrompt` 仍是唯一取词入口）——本卡未触碰 `router.ts` / `CATEGORIES` / `PROMPT_STAGES`。
- `DEFAULT_PROMPT_BUDGET = 24000` 与 floor 不裁口径未触碰（见 t-ebb03c 的汇报）。
- 未新增 `ArtifactKind`；原型产物仍走既有 `notes` 兜底。
