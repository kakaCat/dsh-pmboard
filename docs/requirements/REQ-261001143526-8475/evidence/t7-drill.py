#!/usr/bin/env python3
"""收尾演练：缺口 → 骨架 → 补全 → 绿（REQ-261001143526-8475 t7）。

做四步并把每步退出码写进证据：
  ① 删掉一条工程操作条目（C-18）与其索引行 → `kb-probe` 应**红**并报 K10 缺口
  ② `kb-conventions-sync.mts --write` → 生成骨架（应成功）
  ③ 按骨架补全「失败怎么办」→ `kb-probe` 应**绿**
  ④ `pnpm run kb:check` → 应**绿**

跑法：python3 docs/requirements/REQ-261001143526-8475/evidence/t7-drill.py
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.getcwd()
CONV = os.path.join(ROOT, 'docs/knowledge/conventions.md')
INDEX = os.path.join(ROOT, 'docs/knowledge/INDEX.md')
OPS = os.path.join(ROOT, 'docs/knowledge/operations.tsv')
EVID = os.path.join(ROOT, 'docs/requirements/REQ-261001143526-8475/evidence')
FILL = '- 失败怎么办：看脚本输出的 git 错误行；权限/凭证问题检查远端配置与 ~/.dsh/.credentials.yaml'


def run(cmd: list[str]) -> tuple[int, str]:
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


def drop_c18(text: str) -> str:
    block = re.search(r'### C-18 .*?(?=\n## |\Z)', text, re.S)
    assert block, 'C-18 条目未找到'
    return text[:block.start()] + text[block.end():]


def main() -> int:
    out: list[str] = ['# t7 收尾演练（' + datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ') + '）', '']
    conv = open(CONV, encoding='utf-8').read()
    index = open(INDEX, encoding='utf-8').read()
    ops = open(OPS, encoding='utf-8').read()
    try:
        # ① 制造缺口
        open(CONV, 'w', encoding='utf-8').write(drop_c18(conv))
        open(INDEX, 'w', encoding='utf-8').write(
            '\n'.join(l for l in index.split('\n') if not l.startswith('- kb-conventions-c-18 ·')) + '\n')
        code, text = run(['npx', 'tsx', 'scripts/kb-probe.mts'])
        out += ['## ① 删掉 C-18 与其索引行后（期望：红 + K10 缺口）', '退出码: ' + str(code)]
        out += [l for l in text.split('\n') if 'K10' in l][:2] + ['']

        # ② 生成骨架
        code, text = run(['npx', 'tsx', 'scripts/kb-conventions-sync.mts', '--write'])
        out += ['## ② kb-conventions-sync --write（期望：成功，生成骨架）', '退出码: ' + str(code), text[-400:], '']

        # ③ 补全「失败怎么办」
        cur = open(CONV, encoding='utf-8').read()
        cur = cur.replace('- 失败怎么办：（待补：写清失败信号与修复位置，例如 C-0X 或某文件路径）', FILL)
        open(CONV, 'w', encoding='utf-8').write(cur)
        code, text = run(['npx', 'tsx', 'scripts/kb-probe.mts'])
        out += ['## ③ 补全四要素后 kb-probe（期望：绿）', '退出码: ' + str(code),
                '\n'.join(l for l in text.split('\n') if 'K10' in l or l.startswith('kb-probe')) + '']

        # ④ 全量门禁
        code, text = run(['npm', 'run', 'kb:check', '--silent'])
        out += ['## ④ pnpm run kb:check（期望：绿）', '退出码: ' + str(code), text.split('\n')[-1], '']
    finally:
        open(CONV, 'w', encoding='utf-8').write(conv)
        open(INDEX, 'w', encoding='utf-8').write(index)
        open(OPS, 'w', encoding='utf-8').write(ops)

    code, text = run(['npx', 'tsx', 'scripts/kb-probe.mts'])
    out += ['## 还原后（期望：绿，条目与索引行回到原状）', '退出码: ' + str(code), text.split('\n')[-1], '']
    os.makedirs(EVID, exist_ok=True)
    with open(os.path.join(EVID, 't7-drill.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(out) + '\n')
    print('写入 evidence/t7-drill.txt')
    return 0


if __name__ == '__main__':
    sys.exit(main())
