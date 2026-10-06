---
req_id: REQ-261005154851-8512
kind: evidence
---

# 机器证据与实机留痕（REQ-261005154851-8512）

> 结论先给：**声明难度现在算数了**——同一段文本，带 `expert` 取到 `heavy` 系分片并留依据句；
> 不带声明时**分片 id 与改造前的基线快照全等**。实机那一段有"改造前/改造后"两段真实留痕可对照。

## 1. 探针（同文本两种声明的并排对比）

```bash
npx tsx scripts/injection-difficulty-probe.mts    # → exit 0
# ── 带声明 expert ──
# declared_route     = brainstorming/heavy/feature
# declared_fragments = brainstorming/heavy/feature, brainstorming/heavy, brainstorming/heavy/overrides,
#                      brainstorming/heavy-extra, brainstorming/feature, common/iron-rules
# reasons            = ["声明难度已映射为取词档 heavy"]
# ── 不带声明（改造前行为） ──
# baseline_route     = brainstorming/light/feature
# baseline_fragments = brainstorming/light/feature, brainstorming/light, brainstorming/feature, common/iron-rules
# reasons            = []
# 映射读数           = simple→light / standard→light / advanced→heavy / expert→heavy
```

## 2. 主用例集与回归

```bash
npx vitest run tests/injection-difficulty.test.ts
# → Test Files 1 passed / Tests 11 passed（T-01~T-11）

npx vitest run tests/difficulty-mapping.test.ts tests/content-gates.test.ts \
  tests/decision-gates.test.ts tests/injection-difficulty.test.ts
# → Test Files 4 passed / Tests 78 passed | 2 skipped
```

| 用例 | 钉的是什么 |
|---|---|
| T-01 / T-02 | 同步缝投影两形态：带声明有键；无声明**键不出现** |
| T-03 / T-04 / T-05 | 四档映射：expert/advanced → heavy；standard/simple → light |
| T-06 | 声明 simple 而文本推断重 → **取重不取轻** |
| T-07 / T-08 / T-11 | 无声明与脏数据：分片 id 与基线**全等**、不抛错、不编造依据 |
| T-09 | 三处接线是**静态事实**（源码级断言：三处都经映射函数、两处 resolveStagePrompt 传了 declaredDifficulty、第三处是「显式优先 ?? 声明兜底」） |
| T-10 | 有声明时留痕给出依据句 |

## 3. 类型与构建

```bash
npx tsc --noEmit   # → 0 错误
pnpm build         # → 退出码 0（host dist + client lib/client.js；verify-client OK）
```

## 4. 实机留痕（改造前 / 改造后对照）

查询方式（本仓注入留痕是 JSON，按窗口过滤即可）：

```bash
python3 - <<'PY'
import json, os
p = os.path.expanduser('~/.dsh/state/prompt-injection-log.json')
items = json.load(open(p)); items = items if isinstance(items, list) else items.get('items', [])
win = 'session-30c79856-639c-4483-aed3-a49d3fc99546'
for e in [x for x in items if x.get('windowKey') == win][-3:]:
    print(e.get('stage'), e.get('difficulty'), e.get('fragmentIds'), e.get('difficultyReasons'))
PY
```

**改造前（实测，本次交付前的运行中宿主）**：

```
implementing light ['implementing/light/feature', 'implementing/light', 'implementing/light/overrides', 'implementing/feature', 'common/iron-rules'] None
```

→ 本需求自己是 `expert`，却注入轻档、且**没有任何依据句**——这就是本需求要根治的现象，留作对照。

**改造后（待复核：需重启插件后重跑上面那条命令）**：期望同一行变成

```
implementing heavy [... 'implementing/heavy' ...] ['声明难度已映射为取词档 heavy']
```

> 说明：本次改动在 **host 侧**，运行中的宿主仍持启动时加载的旧模块 ⇒ 该段留痕必须在
> `pnpm build` 后**重启插件/应用**才会翻转。重启后重跑上面命令，把输出贴到本文件即可闭环
> （本项已作为验收单项交人工）。

## 5. 知识层生成物

```bash
npx tsx scripts/kb-build.mts --write   # → 退出码 0（新模块/新探针进代码地图）
```

本需求的探针已按既有惯例登记进 `EXTRA_ENTRIES`（`src/domain/knowledge/operations.ts`），
对 `pnpm kb:check` 的既存红项（6 个此前未归类的 scripts 文件）**贡献为零**。
