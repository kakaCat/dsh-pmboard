# 改动前复现证据（REQ-261006175040-12d4 / FR-1 · FR-3 · FR-7）

采集时间：2026-10-06（立项当天，插件 build `9b5da9a303aa`）
目的：把「卡面四门恒红 + 产物 0/6」这条缺陷钉成可复核的读数，供实施后对照。
本文件是**读数与原始输出**，不是结论推导。

## 1. 线上载荷事实（`GET /state` 只发摘要）

采集命令（本机正在跑的宿主）：

```
curl -s "http://127.0.0.1:19387/dashboard/api/reqboard/state?scope=active&limit=200" -o /tmp/pmstate.json
python3 - <<'EOF'
import json
d = json.load(open('/tmp/pmstate.json'))['data']
r = [x for x in d['requirements'] if x['id'] == 'REQ-261006130057-7a43'][0]
print('keys:', sorted(r.keys()))
print('artifactCount:', r.get('artifactCount'))
for k in ('artifacts', 'plan', 'verification', 'archive', 'comments'):
    print(k, 'present' if k in r else 'ABSENT')
print('n reqs:', len(d['requirements']))
print('with artifacts key:', sum(1 for x in d['requirements'] if 'artifacts' in x))
EOF
```

实得输出：

```
keys: ['artifactCount', 'autoRun', 'blocked', 'category', 'commentCount', 'createdAt', 'docBasePath', 'id', 'projectId', 'promptDifficulty', 'sourceSessionId', 'status', 'title', 'updatedAt', 'version', 'workspaceRoot']
artifactCount: 83
artifacts ABSENT
plan ABSENT
verification ABSENT
archive ABSENT
comments ABSENT
n reqs: 59
with artifacts key: 0
```

对照台账（同一时刻磁盘上的事实）：

```
ls ~/.dsh/reqboard/requirements/REQ-261006130057-7a43/
artifacts.json  comments.jsonl  history.jsonl  plan.json  record.json
# artifacts.json 内：requirement（已落章「可以设计了」）、design ×6（已落章）、decomposition（已批准）均已登记
# record.json: status=implementing, category=feature, artifactCount=83
```

⇒ 摘要**只有计数**，本体（`artifacts`/`plan`/`verification`/`archive`）一个不带——这是「首屏只发摘要」的既定设计
（`src/domain/requirement/RequirementSummary.ts:170-177` 的 `BIG_FIELD_KEYS`），不是本条缺陷本身。
缺陷在于卡面仍从这些字段算门状态（`src/client/views/artifacts.ts:34,39,91,97,111`）。

## 2. 卡面渲染复现（把摘要形状喂进渲染器）

临时用例（诊断用，跑完即删；FR-7 要求把它变成**常驻**用例）：

```ts
// 夹具只给摘要字段（无 artifacts/plan/verification/archive），模拟 /state 的真实下发形状
const state: BoardState = { revision: 1, requirements: [summaryShape()], tasks: [], ready: {} }
const html = buildBoard(state)
```

实得输出：

```
CHIPS: [
  'dsh-pm-artifact-chip missing" title="需求文档缺失">✗ 需求文档',
  'dsh-pm-artifact-chip missing" title="设计文档缺失">✗ 设计文档',
  'dsh-pm-artifact-chip missing" title="拆分计划缺失">✗ 拆分计划',
  'dsh-pm-artifact-chip missing" title="验收材料缺失">✗ 验收材料'
]
DERIVED: [ 'dsh-pm-artifact-derived">产物 0/6</div>' ]
HAS_CONFIRM_BTN: false
```

与用户截图逐字一致（四门红 ✗ + `产物 0/6`）。

## 3. 同根因连带项（同一份摘要缺失导致）

| 现象 | 代码位置 | 实得读数 |
|---|---|---|
| 卡面「确认产物」按钮永不渲染 | `artifacts.ts:82-105`（`renderConfirmButton` 找不到产物即返回空串） | `HAS_CONFIRM_BTN: false` |
| `confirm-artifact` 全仓只有卡面一处渲染 ⇒ G1/G2 看板侧确认入口整体失效 | `grep -rn "confirm-artifact" src/client` → 仅 `views/artifacts.ts:75,95,100` | API `confirmArtifact` 仅由该动作触发 |
| 计划 chip 永不出现 | `artifacts.ts:247`（`req.plan === undefined` 即返回空串） | 拆分态卡片看不到「计划待批」 |
| accepting 卡一律谎报「待验收材料」 | `views/verification.ts:99-104`（`req.verification === undefined`） | 已交材料也显示「待验收材料」 |

## 4. 实施后对照口径

- 同一夹具（摘要形状）必须渲染出 `✓需求文档 ✓设计文档 ✓拆分计划 ✗验收材料` + `门 3/4` + 无确认按钮（该门无产物）。
- 载荷对照：同一批需求 `/state` 体积差 ≤ 5%（见需求文档 §非功能需求）。
- 读放大对照：连续 3 次 `/state` 不新增读 `artifacts.json`/`plan.json`/`verification.json`/`archive.json`。
