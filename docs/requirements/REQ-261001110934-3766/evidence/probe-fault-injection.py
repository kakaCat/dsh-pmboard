#!/usr/bin/env python3
"""kb-probe 故障注入证据（REQ-261001110934-3766 t9 验收）。

做法：逐类把知识层"改坏"→ 跑 `npx tsx scripts/kb-probe.mts` → 记录退出码与输出 → **还原**。
六类故障覆盖 K2（语法）、K4（死链）、K5（孤儿）、K6（stale）、K7（生成物漂移）、K8（规范校验目标）。
跑法：python3 docs/requirements/REQ-261001110934-3766/evidence/probe-fault-injection.py
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.getcwd()
KB = os.path.join(ROOT, 'docs/knowledge')
INDEX = os.path.join(KB, 'INDEX.md')
TOKENS = os.path.join(KB, 'design-tokens.md')
CONV = os.path.join(KB, 'conventions.md')
ENTRIES = os.path.join(KB, 'entries')
PROBE = ['npx', 'tsx', 'scripts/kb-probe.mts']

ENTRY_TMPL = """---
id: kb-{n}
kind: decision
status: active
title: {title}
one_liner: {one}
applies_when: 故障注入测试
pointer: ""
updated: {updated}
expires: {expires}
---

## 结论
（故障注入用）
## 适用条件
x
## 证据
x
## 失效条件
x
## 相关
x
"""


def read(p: str) -> str:
    with open(p, encoding='utf-8') as f:
        return f.read()


def write(p: str, s: str) -> None:
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s)


def run_probe() -> tuple[int, str]:
    r = subprocess.run(PROBE, cwd=ROOT, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


def main() -> int:
    backups = {p: read(p) for p in (INDEX, TOKENS, CONV)}
    out: list[str] = [
        '# kb-probe 故障注入证据（' + datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ') + '）',
        '',
    ]
    code, text = run_probe()
    out += ['## 基线（未注入）', f'退出码: {code}', text, '']

    faults: list[tuple[str, object]] = [
        ('非法索引行（缺分隔符）·期望 K2', lambda: write(
            INDEX, read(INDEX).replace('- kb-architecture-layers · architecture',
                                      '- kb-architecture-layers 缺分隔符 · architecture'))),
        ('死链（指针指向不存在的页）·期望 K4', lambda: write(
            INDEX, read(INDEX).replace('→ conventions.md#c-01', '→ conventions-missing.md#c-01'))),
        ('孤儿（条目文件不在索引）·期望 K5', lambda: write(
            os.path.join(ENTRIES, 'kb-0099.md'),
            ENTRY_TMPL.format(n='0099', title='孤儿条目', one='不在索引里', updated='2026-10-01', expires='2027-03-30'))),
        ('stale（过期未复核）·期望 K6', lambda: (
            write(os.path.join(ENTRIES, 'kb-0098.md'),
                  ENTRY_TMPL.format(n='0098', title='过期条目', one='过期未复核', updated='2020-01-01', expires='2020-06-01')),
            write(INDEX, read(INDEX).replace(
                '- kb-glossary-terms · glossary',
                '- kb-0098 · decision · 过期未复核 · → entries/kb-0098.md\n- kb-glossary-terms · glossary')))),
        ('生成物漂移（手改生成物）·期望 K7', lambda: write(TOKENS, read(TOKENS) + '\n手改一行\n')),
        ('规范校验目标不存在 ·期望 K8', lambda: write(
            CONV, read(CONV).replace('tests/size-budget.test.ts', 'tests/nonexistent-gate.test.ts'))),
    ]

    for name, inject in faults:
        inject()  # type: ignore[operator]
        code, text = run_probe()
        out += [f'## 故障：{name}', f'退出码: {code}', text, '']
        # 还原：索引 / 生成物 / 规范页回到备份，临时条目删除
        for p, content in backups.items():
            write(p, content)
        for tmp in ('kb-0099.md', 'kb-0098.md'):
            fp = os.path.join(ENTRIES, tmp)
            if os.path.exists(fp):
                os.remove(fp)
        if os.path.isdir(ENTRIES) and not os.listdir(ENTRIES):
            os.rmdir(ENTRIES)

    code, text = run_probe()
    out += ['## 还原后（期望回到零失败）', f'退出码: {code}', text, '']

    dest = os.path.join(ROOT, 'docs/requirements/REQ-261001110934-3766/evidence/t9-probe-fault-injection.txt')
    write(dest, '\n'.join(out) + '\n')
    print(f'写入 {dest}')
    failed = [l for l in out if l.startswith('退出码:') and l != '退出码: 0']
    print(f'非零退出次数（期望 6 次注入各 1 次）: {len(failed)}')
    return 0 if code == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
