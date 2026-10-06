# 裁剪口径的两处收紧（t-540c7e / FR-1）

> 设计 `data-model.md §1` 的 `trimmed` 列了 4 条。实施时发现按**字面 glob** 执行会漏掉两类
> 同样"非运行时资产"的东西。本文件记录收紧的依据与实测数字——这是**可被人否决**的取舍，不是暗改。

## 收紧 1：自测规则从 `**/scripts/tests/` 加宽为 `**/scripts/**/tests/`

- **原字面**只匹配"名为 `scripts` 的目录**直接**含 `tests`"。因此
  `design/scripts/logo/tests/test_generate.py` **被收进了包**（10,380 B）。
- **依据**：FR-1 给这条规则的理由是「上游自测，非运行时资产」——该理由对深层嵌套的
  `tests` 目录**一字不差地成立**。需求/设计全文没有任何一处承诺要携带上游自测。
- **结果**：仍是一条规则（glob 文本改为 `**/scripts/**/tests/`），剔除字节 336,946 → 347,326。
  实测 `find skills -type d -name tests` → 0。

## 收紧 2：新增 `**/__pycache__/`（88,746 B）

- 上游 gitignore 的字节码缓存（3 个 `.pyc`）原本被收进包：四条规则都没覆盖它。
- **依据**：字节码缓存是**生成物**，且跑一次 vendored 资产就会被 Python 就地重写
  （实测：跑一次 `search.py` 后 `find skills -name __pycache__` = 1 个目录，树被改动）。
  发布包里携带会被自己改写的生成物没有意义。
- **结果**：`trimmed` 共 **5** 条，新增一条 `glob: "**/__pycache__/"`、`bytes: 88746`。
  交付态实测 `find skills -name __pycache__` → 0、`find skills -name '*.pyc'` → 0。

## 明确**不**做的事（有意留白，避免把正常使用判成违规）

跑 `search.py` 会**重建** `__pycache__`（Python 默认行为，除非设 `PYTHONDONTWRITEBYTECODE=1`）。
**没有**把"树里不许有 `__pycache__`"写进 `--check` 硬门禁——那会让"先跑过一次资产、再跑 --check"
必然变红，而资产本来就是拿来跑的。指纹口径只覆盖 `SKILL.md` 与 `scripts/**.py`，
故运行时重建的 `.pyc` 不影响 `--check`（实测 `--check` 恒 exit 0）。

若将来要连运行时残留也禁止，正确做法是改上游 `search.py`（不归本需求）或在派发 prompt 里
带 `PYTHONDONTWRITEBYTECODE=1`（属另一条需求）。

## 收紧后的规模

| 项 | 值 |
|---|---|
| `skills/` 合计 | **2,801,800 B（2.67 MiB）**，145 文件 |
| 指纹条数 | **28** = 7 × `SKILL.md` + 21 × `scripts/**.py` |
| `du -sm skills` | **4**（≤ 5 上限） |
| 与源树逐文件 sha256 比对 | 144 个收录文件 **全部逐字节相同**（0 缺、0 多、0 差异） |
