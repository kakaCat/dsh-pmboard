---
serves: FR-1, FR-2, FR-6, FR-7
---

# REQ-261005122347-e07a · 架构设计

> 本需求**不新增子系统**，只做三件事：**收录**（vendor 资产）、**投放**（materialize 到用户工作区）、
> **注入一小节引用**。既有注入链（`resolveStagePrompt` 唯一入口、四处折入点）一行不改。

## 1. 资产落点与来源（serves: FR-1, FR-2）

```
dsh-pmboard 包根
├── templates/                     <- 既有：地址段模板（resolveTemplateRoot 解到这里）
├── skills/                        <- 新增：vendor 的 7 个 skill（源资产）
│   ├── PROVENANCE.md              <- 来源 / MIT / upstream commit / 裁剪清单 / sha256
│   ├── ui-ux-pro-max/             <- 主 skill（检索工具，2.2MB 裁剪后）
│   ├── ui-styling/  design/  design-system/  brand/  slides/  banner-design/
└── src/domain/prompt/fragments/brainstorming/…   <- 注入节（本文档 §3）
```

- 落点与 `templates/` **同级**，用 `src/adapters/TemplateRoot.ts` 同一条包根解析规则
  （源码态 `src/index.ts` 与构建态 `dist/index.mjs` 同解 `<pkg>/`）——这是本仓"包根非 TS 资产如何被运行时读取"的既有唯一范式（需求 E-4）。
- **不选** `src/domain/prompt/vendor/`：那里是构建期镜像源（`vendor/superpowers/`），不参与运行时读取。
- `package.json` 的 `files` 必须补 `"skills"`；不补 = dev 能跑、装机 404（需求 FR-2 的静默缺口）。

**裁剪（随 PROVENANCE.md 记录理由，可被人否决）**：

| 裁剪项 | 体量 | 理由 | 证据 |
|---|---|---|---|
| `**/scripts/tests/` | 主 skill 252KB（另 design-system 1.9KB、brand 12.2KB） | 上游自测，非运行时资产 | 需求 E-6 |
| `ui-styling/canvas-fonts/` | **5.5MB** | 字体二进制，非检索/规则依赖 | 实测 `du` |
| `ui-ux-pro-max/data/phosphor-icons-upstream.json` | 805KB | 上游图标目录刷新用 | **实测已验**：删除后 4 类检索全 exit 0 |
| `ui-ux-pro-max/data/google-font-licenses.json` | 423KB | 许可展示用，同上 | 同上 |

裁剪后目标：**7 个 skill ≤ 5MB**（实测：主 skill 3.6MB→2.2MB）。不适用的项（如字体确需）由人否决后加回。

## 2. 投放链路：插件资产 → 用户工作区（serves: FR-1, FR-6）

**为什么必须投放**（不是可选优化）：子代理的文件/命令工具**限工作区**，而 skill 资产在插件包内。
人已裁定退路为"投放到用户项目"；本设计**把它作为主路径**（子代理只读工作区路径，最稳），
插件包内资产是**源**。

```
   插件包 <pkg>/skills/**           用户工作区 <root>/.dsh/skills/**
   +----------------------+          +--------------------------------+
   | 7 个 skill（源，只读）| --投放--> | 同名复制 + .manifest.json      |
   | PROVENANCE.md        |          | （sha256/commit/裁剪清单）      |
   +----------------------+          +--------------------------------+
                                              |
                        brainstorming 要求做原型时，主 agent 调
                        reqboard_skill_install  ->  返回绝对路径
                                              |
                                              v
                                    派 subagent（附路径 + 命令模板）
```

- **投放根**：`<会话工作区>/.dsh/skills/`（工作区相对，隐藏目录；不用需求目录——`docs/requirements/<REQ>/`
  下任何文件都会被 `artifact-discovery` 当产物扫描，塞 5MB 资产会污染台账）。
- **自忽略**：投放时在根写 `.gitignore`（内容 `*`），不改用户既有 `.gitignore`（最小侵入；需求 FR-4 的红线里写明"不写需求目录以外的地方"**不包括**本投放根——它是插件自己的受管目录，文档里显式声明）。
- **幂等**：逐文件比对 `sha256` → 全等则 `reused=true` 不重写；版本不一致 → 只覆盖本插件投放过的同名文件（不删用户新增）。
- **可回滚**：`rm -rf <root>/.dsh/skills` 即完全回滚（无台账、无状态残留）。

## 3. 与既有提示词体系的关系（serves: FR-3, FR-7）

```
   capture-section（每轮 system prompt）
   H3（闸门批准后）                        四处注入点
   节点输入包（H2/交接）         ---------> 全部经 resolveStagePrompt（INV-1，一行不改）
   dive-node（留痕）
             |
             v
   + 新增：「原型工作原则」追加节（可裁优先级，非 floor，≤1200 字符）
             |
             +-- 只给「引用」：投放根绝对路径 + search.py 调用模板 + 何时用 + 红线
             +-- 不给全文、不给 CSV 数据（预算 24000 / heavy 已用 15,456 字符，见需求 E-3）
```

- 追加机制复用既有形态（`application/internal/injection-address.ts` 的"取词后折入一节"），
  **不新增路由维度**：不动 `router.ts`、不动 `CATEGORIES`/`PROMPT_STAGES` 受控枚举（需求边界 4）。
- 可回滚开关：插件配置 `skills.enabled`（缺省 `true`；`false` = 不注入该节 + 工具返回 `disabled`）。
  与 `docsRootSource`/`archive.unlistedGate` 同口径：**非法值装配期抛错**，不静默回落。

## 4. 验收与证据锚点（serves: FR-7）

| 判据 | 命令 | 期望 |
|---|---|---|
| 片段↔产物一致 | `node scripts/check-prompt-fragments.mjs` | 退出码 0 |
| P1 基线显式更新 | `node scripts/dump-stage-prompts.mjs && npx vitest run tests/prompt-baseline.test.ts` | 全绿 |
| 预算不破 | `npx vitest run tests/prompt-cost.test.ts` | 全绿；brainstorming(heavy) charCount ≤ 24000 |
| 资产完整 | `npx vitest run tests/skills-assets.test.ts`（新增） | 7 个 SKILL.md + search.py 在盘；`<pkg>/skills` ≤ 5MB |
| 检索可用 | `python3 <root>/.dsh/skills/ui-ux-pro-max/scripts/search.py "internal analytics dashboard" --design-system` | 退出码 0 + 非空输出 |
| 类型检查 | `npx tsc --noEmit` | 新增错误 0 |

## 5. 已知留白（不掩盖）（serves: FR-1, FR-7, FR-8）

1. **投产物的许可合规**：`skills/PROVENANCE.md` 记 MIT 与来源，但 vendored 资产里的**第三方数据**
   （Google Fonts 许可 JSON 被裁剪、Phosphor 图标上游 JSON 被裁剪）其许可见证随之缺失——若日后加回，必须先补许可留痕。
2. **投放根约定未在 DSH 侧统一**：`.dsh/skills/` 是本插件自定约定，尚未与其他插件协调；
   若 DSH 将来定义项目级 skill 目录，本设计应改为跟随。
3. **`ui-styling/canvas-fonts` 的功能损失未实测**：该目录只在生成画布/字体类产出时可能需要，
   本次只是裁掉并记录；若子代理报缺字体，按 PROVENANCE 加回。
