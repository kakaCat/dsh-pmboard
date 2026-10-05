#!/usr/bin/env python3
"""知识库体量探针（只读，可复核）。

用途：量化「naive 全量阅读」与「结构化骨架」的体量差，作为知识库需求的可证伪证据。
口径：**字符数**（token 的确定性代理指标）。代码 token 粗估 = 字符/3，中文文档粗估 = 字符×2/3。
跑法：python3 docs/requirements/<REQ>/evidence/volume-probe.py  （在仓库根执行）
"""
import os, re

def walk(root, exts):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ('.git', 'node_modules', 'dist', 'lib')]
        for f in filenames:
            if f.endswith(exts):
                yield os.path.join(dirpath, f)

def chars(paths):
    return sum(len(open(p, encoding='utf-8', errors='replace').read()) for p in paths)

def text(paths):
    return ''.join(open(p, encoding='utf-8', errors='replace').read() for p in paths)

# 1) 源码全量 vs 导出签名骨架
src = list(walk('src', ('.ts',)))
src_chars = chars(src)
sig_re = re.compile(r'^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?'
                    r'(?:function|class|interface|type|const|enum|namespace)\s+[^\n{=]*', re.M)
sig_chars = sig_count = 0
for p in src:
    s = open(p, encoding='utf-8', errors='replace').read()
    for m in sig_re.finditer(s):
        sig_chars += len(m.group(0).strip()) + 1
        sig_count += 1

# 2) 文档全量
docs = list(walk('docs', ('.md',)))
docs_chars = chars(docs)

# 3) 需求目录体量分布
dist = []
if os.path.isdir('docs/requirements'):
    for d in sorted(os.listdir('docs/requirements')):
        p = os.path.join('docs/requirements', d)
        if os.path.isdir(p):
            dist.append((chars(list(walk(p, ('.md',)))), d))

print(f'源码: {len(src)} 个 .ts, {src_chars} 字符 (~{src_chars//3} tok)')
print(f'导出签名骨架: {sig_count} 条, {sig_chars} 字符 (~{sig_chars//3} tok), 占全量 {sig_chars/src_chars*100:.2f}%')
print(f'文档: {len(docs)} 个 .md, {docs_chars} 字符 (~{docs_chars*2//3} tok)')
print('需求目录体量 Top:')
for c, d in sorted(dist, reverse=True)[:10]:
    print(f'  {c:>8} 字符  {d}')

# 4) 代码规范载体（测试 + 门禁脚本）——规范「存在但不可检索」的度量
tests = list(walk('tests', ('.ts',)))
tests_chars = chars(tests)
gates = list(walk('scripts', ('.mjs', '.mts')))
print(f'\n规范载体 · 测试: {len(tests)} 个 .ts, {tests_chars} 字符 (~{tests_chars//3} tok)')
print(f'规范载体 · 脚本: {len(gates)} 个文件, {chars(gates)} 字符')

# 5) 前端样式：体量 + 设计令牌（颜色/变量/断点/类名）
style_files = [p for p in walk('src/client', ('.ts',)) if 'styles' in p]
styles = text(style_files)
hexes = re.findall(r'#[0-9a-fA-F]{3,8}\b', styles)
vars_ = sorted(set(re.findall(r'(--[a-z0-9-]+)\s*:', styles)))
classes = sorted(set(re.findall(r'\.(dsh-pm-[A-Za-z0-9_-]+)', styles)))
queries = sorted(set(re.findall(r'@(?:media|container)\s*\(max-width:\s*([0-9]+px)', styles)))
print(f'\n前端样式: {len(style_files)} 个文件, {len(styles)} 字符, 规则块 ≈{styles.count("{")}')
print(f'  颜色: {len(hexes)} 次出现 / {len(set(h.lower() for h in hexes))} 种去重')
print(f'  CSS 变量: {len(vars_)} 个')
print(f'  dsh-pm-* 类名: {len(classes)} 个')
print(f'  断点(max-width): {queries}')

# 6) 架构说明体量
arch = list(walk('docs/architecture', ('.md',)))
print(f'\n架构说明: {len(arch)} 篇, {chars(arch)} 字符')
