# 反向演练 · 资产指纹漂移必红（t-540c7e / FR-8）

> 目的：证明 `--check` 不是"恒绿的空门禁"。**删掉断言/改一个字节必须红**，且能点名到文件。

## 演练步骤与实测输出（2026-10-05，本机）

```
$ node scripts/vendor-skills.mjs --check
[vendor-skills] OK: 28 条 sha256 指纹一致；skills 清单 7 项与磁盘一致；合计 2801800 B (2.67 MiB)（上限 5242880 B (5.00 MiB)）
exit 0
```

```
$ printf 'X' >> skills/ui-ux-pro-max/SKILL.md     # 手改一个字节（模拟静默漂移）
$ node scripts/vendor-skills.mjs --check
sha256 不一致: skills/ui-ux-pro-max/SKILL.md
  记录: <hex>
  实测: <hex>
exit 1
```

还原并复核：

```
$ node scripts/vendor-skills.mjs
$ node scripts/vendor-skills.mjs --check
exit 0
```

## 同类负例（均 exit 1 且报点明确，子代理实测）

- 删掉一个被指纹的 `.py`／多一个未收录的 skill 目录／多一个 `scripts/**.py`
- front-matter 缺闭合 `---`／非法 YAML 行／指纹 hex 改 1 个字符
- 体积超限（用 `/tmp` 合成源跑到 9,192,315 B）→ FAIL 且**不写出 PROVENANCE.md**（不留半份契约）
- 源 commit 不匹配 → exit 1 并给修复指引；源不是 git 仓库 → WARN 回落基线（不静默）

## 另一条不变量：`--check` 零写盘

比对前后 `find skills -type f -exec stat -f '%N %z %m'` 全量指纹 → 完全一致。
PROVENANCE.md 两次 `vendor` 运行**逐字节一致**（脚本确定性）。

## 结论

指纹门禁**有牙齿**：内容被手改即红、点名到文件、且检查动作本身不产生副作用。

## 反向演练（本次实跑）：**删掉断言 → 判定必然失守**

光有"篡改会红"还不够——得证明红是**那条比对照成的**，不是别的东西顺手报的。做法：

```
① 备份脚本；把 sha256 比对那一行改成 `if (false)`（断言被拿掉，其余逻辑一字未动）
② printf 'X' >> skills/ui-ux-pro-max/SKILL.md
③ node scripts/vendor-skills.mjs --check
   → [vendor-skills] OK: 28 条 sha256 指纹一致……  exit 0     ← 门禁空转，篡改被放过
④ 还原脚本 + 重跑 node scripts/vendor-skills.mjs
⑤ node scripts/vendor-skills.mjs --check → exit 0           ← 干净态
⑥ 再篡改一个字节 → --check → exit 1（点名 skills/ui-ux-pro-max/SKILL.md）
⑦ 重跑收录脚本 → --check → exit 0                            ← 还原
```

③ 是这次演练的要点：**断言不在了，篡改就查不出来**。故上述"篡改必红"不是恒真断言，
而是这一行比对在起作用。①-④ 的脚本改动**已逐字节还原**（还原后 ⑤⑥⑦ 与原始行为一致）。

