#!/usr/bin/env python3
"""eval-suite 全量自检脚本（REQ-261002120707-deab 测试证据，可重跑）。

用法：python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py
退出码：0 = 全过；1 = 有违规。
"""
import glob
import os
import sys

import yaml

OPS = {'eq', 'ne', 'exists', 'absent', 'count_eq', 'count_lte', 'contains', 'not_contains', 'matches'}

# 需求文档用例表期望值：id -> (max_score, severity)
EXPECTED = {
    'A1': (3, 'normal'), 'A2': (3, 'normal'), 'A3': (2, 'normal'), 'A4': (3, 'normal'), 'A5': (3, 'normal'),
    'B1': (4, 'normal'), 'B2': (4, 'redline'), 'B3': (3, 'redline'), 'B4': (3, 'normal'), 'B5': (3, 'normal'), 'B6': (3, 'normal'),
    'C1': (4, 'normal'), 'C2': (4, 'redline'), 'C3': (4, 'redline'), 'C4': (3, 'normal'), 'C5': (3, 'normal'), 'C6': (3, 'normal'),
    'D1': (4, 'normal'), 'D2': (4, 'normal'), 'D3': (3, 'normal'), 'D4': (3, 'normal'), 'D5': (3, 'normal'), 'D6': (3, 'normal'),
    'E1': (4, 'normal'), 'E2': (3, 'normal'), 'E3': (3, 'redline'), 'E4': (4, 'normal'), 'E5': (3, 'normal'),
    'F1': (3, 'normal'), 'F2': (4, 'redline'), 'F3': (2, 'normal'), 'F4': (2, 'normal'),
    'G1': (2, 'normal'), 'G2': (3, 'normal'), 'G3': (3, 'normal'), 'G4': (2, 'normal'),
}

errs = []
scen = {}
for f in sorted(glob.glob('eval-suite/scenarios/*.yml')):
    try:
        d = yaml.safe_load(open(f))
    except Exception as e:
        errs.append(f'{f}: YAML 解析失败 {e}')
        continue
    cid = d.get('id')
    scen[cid] = d
    for k in ['id', 'group', 'type', 'severity', 'title', 'dims', 'max_score', 'seed', 'expected']:
        if k not in d:
            errs.append(f'{f}: 缺字段 {k}')
    if 'user_messages' not in d.get('seed', {}):
        errs.append(f'{f}: 缺 seed.user_messages')
    exp = d.get('expected', {})
    for r in ['trajectory_ref', 'ledger_ref']:
        if exp.get(r) != cid:
            errs.append(f'{f}: expected.{r}={exp.get(r)} ≠ id {cid}')
    if cid in EXPECTED:
        s, sev = EXPECTED[cid]
        if d['max_score'] != s:
            errs.append(f'{cid}: max_score {d["max_score"]}≠{s}')
        if d['severity'] != sev:
            errs.append(f'{cid}: severity {d["severity"]}≠{sev}')

missing_cases = [c for c in EXPECTED if c not in scen]
if missing_cases:
    errs.append(f'缺用例: {missing_cases}')

red = sorted(c for c in EXPECTED if EXPECTED[c][1] == 'redline')

for kind in ['ledger', 'trajectory']:
    for f in sorted(glob.glob(f'eval-suite/assertions/{kind}/*.yml')):
        try:
            d = yaml.safe_load(open(f))
        except Exception as e:
            errs.append(f'{f}: YAML 解析失败 {e}')
            continue
        cid = f.split('/')[-1][:-4]
        if d.get('case') != cid:
            errs.append(f'{f}: case={d.get("case")} ≠ 文件名')
        if kind == 'ledger':
            for i, c in enumerate(d.get('checks', [])):
                if c.get('op') not in OPS:
                    errs.append(f'{f}: checks[{i}] 非法算子 {c.get("op")}')
                p = c.get('path', '')
                if not (p.startswith('requirement.') or p.startswith('queue.')):
                    errs.append(f'{f}: checks[{i}] path 前缀非法: {p}')
        else:
            if 'ordered_contains' not in d:
                errs.append(f'{f}: 缺 ordered_contains')
            if 'budget' not in d:
                errs.append(f'{f}: 缺 budget')

tri = [c for c in scen if all(os.path.exists(f'eval-suite/assertions/{k}/{c}.yml') for k in ['ledger', 'trajectory'])]
rub = [c for c, d in scen.items() if d.get('expected', {}).get('rubric_ref')]
rub_missing = [c for c in rub if not os.path.exists(f'eval-suite/rubrics/{scen[c]["expected"]["rubric_ref"]}.md')]

print(f'scenarios: {len(scen)}  ledger: {len(glob.glob("eval-suite/assertions/ledger/*.yml"))}  trajectory: {len(glob.glob("eval-suite/assertions/trajectory/*.yml"))}')
print(f'三件套齐全: {len(tri)}/36')
print(f'红线 6 条: {red}')
print(f'rubric_ref 用例: {sorted(rub)}  缺文件: {rub_missing or "无"}')
print('RESULT:', 'FAIL' if errs else 'PASS')
for e in errs:
    print(' -', e)
sys.exit(1 if errs else 0)
