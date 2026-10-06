# `/state` 载荷基线（改动前，REQ-261006175040-12d4 / FR-2 · FR-7）

采集时间：2026-10-06（design 阶段，改动前，插件 build `9b5da9a303aa`）
用途：给 FR-7 的「载荷增量 ≤ 5%」与 `design/architecture.md` §4 的读放大预算留一份**改动前**读数，
供实施后同口径对比。本文件只放读数与采集命令，不含结论推导。

> ⚠️ 读数会随台账增长，比较时必须**重新采集两端**（改动前那份不能复用），否则比较的是两个时点而不是两次改动。

## 1. 采集命令

```bash
curl -s "http://127.0.0.1:19387/dashboard/api/reqboard/state?scope=active&limit=200" -o /tmp/pmstate-before.json
wc -c /tmp/pmstate-before.json
python3 - <<'EOF'
import json
raw = open('/tmp/pmstate-before.json','rb').read()
d = json.loads(raw)['data']
reqs, tasks = d['requirements'], d['tasks']
tot = sum(len(json.dumps(r, ensure_ascii=False).encode()) for r in reqs)
print('bytes =', len(raw))
print('需求数 =', len(reqs), '· 任务数 =', len(tasks))
print('需求摘要合计 = %.1f KiB' % (tot/1024))
print('任务 JSON 合计 = %.1f KiB' % (sum(len(json.dumps(t, ensure_ascii=False).encode()) for t in tasks)/1024))
print('单需求摘要均值 = %.0f B' % (tot/len(reqs)))
print('含 artifacts 键 =', sum(1 for r in reqs if 'artifacts' in r), '/', len(reqs))
EOF
```

## 2. 实得读数（改动前，2026-10-06）

| 读数 | 值 |
|---|---|
| `/state` 响应体（`scope=active&limit=200`） | **9,325,744 B ≈ 8.89 MiB** |
| 需求数（active） | **60** |
| 任务数 | **2047** |
| 需求摘要 JSON 合计 | **35.2 KiB**（单需求均值 **600 B**） |
| 任务 JSON 合计 | **9482.4 KiB**（占响应体 ≈ 99.6%） |
| 含 `artifacts` 键的需求数 | **0 / 60** ⇒ 这就是「四门恒红」的根因读数 |

## 3. 改动后要对照的三件事（口径写死，避免事后挑好看的口径）

1. **响应体增量**：同一命令、同一批需求，`改动后 / 改动前 − 1 ≤ 5%`。
   设计预期：+230 B/条 × 60 ≈ **+14 KB ≈ +0.15%**。
   同时**如实记录**另一个口径：需求摘要本身会从 600 B 涨到约 830 B（**+38%**）——
   它占比极小（35 KiB / 8.9 MiB），但两个口径都要写进验收材料，不许只挑好看的那个。
2. **读放大**：连续 3 次 `/state` **不得**新增对 `artifacts.json` / `plan.json` / `verification.json` /
   `archive.json` 的读取（索引命中即 0）。判据由 `tests/state-no-bigfield-read.test.ts` 的桩计数给出。
   设计预期：多读的 2.19 MiB 只发生在**索引构建那一刻**，与请求次数无关。
3. **读数正确性**：`REQ-261006130057-7a43` 的摘要应给出 4 门读数（前三 `confirmed`、`verification: missing`）、
   `planState: approved`、`archivePrepared: false`，且大字段键仍不出现。

## 4. 磁盘侧基线（读放大预算的输入）

```bash
python3 - <<'EOF'
import os
root = os.path.expanduser('~/.dsh/reqboard/requirements')
ids = [d for d in os.listdir(root) if d.startswith('REQ-')]
print('目录数 =', len(ids))
for k in ('record', 'artifacts', 'plan', 'verification', 'archive'):
    tot = peak = n = 0
    for i in ids:
        p = os.path.join(root, i, k + '.json')
        if os.path.exists(p):
            s = os.path.getsize(p); tot += s; peak = max(peak, s); n += 1
    print(f'{k+".json":18} 在盘 {n:2}/{len(ids)}  合计 {tot/1024:7.0f} KiB  峰值 {peak/1024:5.0f} KiB')
EOF
```

实得（60 个需求目录）：

| 文件 | 在盘 | 合计 | 峰值 | 本次是否读 |
|---|---|---|---|---|
| `record.json` | 60/60 | 191 KiB | 5 KiB | 已在读（现有索引构建） |
| `artifacts.json` | 59/60 | **1202 KiB** | 77 KiB | **读** |
| `plan.json` | 58/60 | **605 KiB** | 43 KiB | **读** |
| `verification.json` | 55/60 | 1950 KiB | 130 KiB | **不读**（验收 chip 由 verification 门读数表达） |
| `archive.json` | 47/60 | **382 KiB** | 36 KiB | **读** |

⇒ 索引构建多读 `artifacts + plan + archive = 2.19 MiB`；省掉 `verification.json` 的 1.95 MiB。

**注意「在盘 59/60」这类的含义**：文件不存在 = 该需求**从未登记**该类产物 ⇒ 按设计传「真没有」（`[]`），
卡面显示真实缺失（红 ✗）；这与「读失败 ⇒ 不可得 ⇒ 不渲染」是两种不同形态（见 `design/data-model.md` §5）。
