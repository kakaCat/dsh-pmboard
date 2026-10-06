---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
---

# REQ-261005122347-e07a · 测试策略与用例

> 口径：**每条判据都会红**。凡"应该没问题"的表述都改写成可执行断言（本仓返工方法论，见
> `docs/architecture/settings-and-storage-backend.md` §8）。

## 1. 用例总表（serves: FR-1 ~ FR-8）

| # | 用例（新增文件 `tests/skills-*.test.ts`） | 断言（给定 → 期望） | 服务 |
|---|---|---|---|
| TC-1 | `skills-assets.test.ts` 资产完整 | 7 个 `<pkg>/skills/<name>/SKILL.md` 在盘；`ui-ux-pro-max/scripts/search.py` 在盘 | FR-1 |
| TC-2 | 同上 · 清单双向一致 | 目录一级子目录集合 === `PROVENANCE.md` 的 `skills[]`（多一个/少一个都红） | FR-1, FR-2 |
| TC-3 | 同上 · 体积上限 | `<pkg>/skills` 磁盘占用 ≤ 5MB | FR-1, FR-2 |
| TC-4 | 同上 · 打包清单 | `package.json.files` 含 `"skills"` | FR-2 |
| TC-5 | `skills-materialize.test.ts` 幂等 | 连跑两次 `install` → 第二次 `reused=true` 且盘上 mtime 不变 | FR-6 |
| TC-6 | 同上 · 事务性 | 注入写盘失败（把 root 指向只读目录）→ 目标目录**不存在**、无 `.tmp-*` 残留 | FR-6 |
| TC-7 | 同上 · 解释器回执 | 回执含 `python.found/version` 与 `searchScript` 绝对路径 | FR-5 |
| TC-8 | 同上 · 开关 | `skills.enabled=false` → 返回 `REQBOARD_SKILLS_DISABLED`，不写盘 | FR-7 |
| TC-9 | 同上 · 缺资产 | 把 `<pkg>/skills/brand` 改名 → 返回 `REQBOARD_SKILLS_ASSET_MISSING` 且附缺失路径 | FR-6 |
| TC-10 | `skills-injection.test.ts` 注入五要素 | brainstorming 注入含：`必须派 subagent`、`SKILL.md`、`search.py`、`--design-system`、`prototype/`、`reqboard_` 禁用声明 | FR-3, FR-4 |
| TC-11 | 同上 · 无占位符 | 注入文本**不含** `${CLAUDE_PLUGIN_ROOT}` | FR-3 |
| TC-12 | 同上 · 字符上限 | 该节长度 ≤ 1200；brainstorming(heavy) 总 `charCount ≤ 24000` 且 `overBudget` 空 | FR-3, FR-7 |
| TC-13 | 同上 · 可裁 | 人为把 budget 压到极小 → 该节被裁掉（证明它**不是 floor**），且人工门/红旗段仍在 | FR-3, FR-7 |
| TC-14 | 同上 · 降级声明 | 把探测替身设为"找不到" → 注入节仍完整，且含「未做数据库检索」字样 | FR-5 |
| TC-15 | `skills-provenance.test.ts` 指纹 | 改一个资产字节 → 与 `PROVENANCE.md` 的 `sha256` 不一致 → 用例红 | FR-8 |
| TC-16 | 同上 · 篡改检测 | 手改投放目录里一个文件 → manifest 校验红 | FR-8 |

**反向演练（必须做的两处）**：删掉 TC-13 的"可裁"实现（把该节设为 floor）→ TC-13 必红；
删掉 TC-6 的临时目录事务 → TC-6 必红。演练结论写进本需求 `notes/`。

## 2. 提示词门禁（serves: FR-7）

```bash
node scripts/inline-prompt-fragments.mjs      # C-16 重生成
node scripts/check-prompt-fragments.mjs       # C-17 退出码 0
node scripts/dump-stage-prompts.mjs           # 更新 P1 基线（视为显式动作）
npx vitest run tests/prompt-baseline.test.ts tests/prompt-cost.test.ts \
               tests/prompt-tiers.test.ts tests/stage-prompts.test.ts
```

## 3. 端到端（人可复核，serves: FR-1, FR-5）

```bash
# ① 投放（在任一工作区里）
node -e "import('dsh-pmboard').then(m=>console.log(m))"   # 或经会话内工具调用
# ② 检索（实测已通过；此次为回归复核）
python3 <ws>/.dsh/skills/ui-ux-pro-max/scripts/search.py \
  "internal analytics dashboard" --design-system --variance 8 --density 8
# 期望：退出码 0，输出含 PATTERN / STYLE / COLORS / TYPOGRAPHY 段
python3 <ws>/.dsh/skills/ui-ux-pro-max/scripts/search.py "bogusqueryxyzzy" --domain ux
# 期望：退出码 0，明写 "Found: 0 results"（不得伪造）
```

**已取得的实测证据（2026-10-05，本机）**：
① `python3` = 3.8.10，`python`/`py` 缺失；
② 全量签出下 `--design-system` exit 0；
③ **裁剪后**（剔 `scripts/tests/` + 两个大 JSON）主 skill 3.6MB→**2.2MB**，
`ux`/`--design-system`/`--stack nextjs`/`typography` 四类检索全部 exit 0；
④ 空查询如实返回 `Found: 0 results`。

## 4. 回归与基线（serves: FR-7）

```bash
npx tsc --noEmit 2>&1 | grep -c 'error TS'      # ≤ 开工基线（开工时实测写入任务卡）
npx vitest run tests/reqboard tests/application tests/http   # 失败数 ≤ 基线（当前 106）
```
