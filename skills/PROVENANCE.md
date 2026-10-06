---
source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
license: MIT
commit: 477bcb28c9812b385cb51a4605ddf30d7b2266e2
fetchedAt: 2026-10-05
skills:
  - banner-design
  - brand
  - design
  - design-system
  - slides
  - ui-styling
  - ui-ux-pro-max
trimmed:
  - glob: "**/scripts/**/tests/"
    bytes: 347326
    why: 上游自测，非运行时资产
  - glob: "ui-styling/canvas-fonts/"
    bytes: 5530719
    why: 字体二进制，非检索/规则依赖
  - glob: "ui-ux-pro-max/data/phosphor-icons-upstream.json"
    bytes: 823933
    why: 上游图标目录刷新用（实测删后检索仍可用）
  - glob: "ui-ux-pro-max/data/google-font-licenses.json"
    bytes: 433127
    why: 许可展示用（同上）
  - glob: "**/__pycache__/"
    bytes: 88746
    why: Python 字节码缓存（生成物，上游 gitignore；跑一次 vendored 资产就会被重写，包内不应携带）
sha256:
  banner-design/SKILL.md: ccb89ddc848f60bfe630cb19dfe3e062df94a029467a9b15259f2761019ac5c4
  brand/SKILL.md: 1c24139633e2ebf11da4f97eaeb1c0564f8658a40b3ad779387a5b8c6cb76dbc
  design-system/SKILL.md: 8aa5ff93320559a6e5289d37b6b06b3307737dbfb4a6f3fc44135c705613c511
  design-system/scripts/fetch-background.py: 020d4e54bc26595472dc4b5a421830e0e83ffea3f44225fac8ac5f832430e691
  design-system/scripts/generate-slide.py: 0463c98efea54870816925015fe5819e42a29aaba57408c2c38bacb33e2605b9
  design-system/scripts/html-token-validator.py: 1242a778493a8fd646da50623d654b783ed8d1b6d4234b3271789eae9f5a4bed
  design-system/scripts/search-slides.py: 3d3d842d1c1daa26084a89aa7a41eb89d8c62b777f45cb4923b42aa10bb0b041
  design-system/scripts/slide-token-validator.py: 66da5da5e8e659d405a89b342e13dd1e469e79726c46002d9d2368c3c7aaf945
  design-system/scripts/slide_search_core.py: 2464050ae338eb50728086046b644845fa7ae943f32efead3908fdbe1473edbe
  design/SKILL.md: c84f3ecfd6a0fd1c46abf6805a0bbc26ea0b94a104f457e243ccf0943ece123c
  design/scripts/cip/core.py: 78a78a51f12d2382b2854414df395dc62b68532626ef724ddd5de713507911e4
  design/scripts/cip/generate.py: df45dbfd6b57c85451bd51552987834e2d8a32964e3fe69b70aa3b6e4fd7f1e4
  design/scripts/cip/render-html.py: a49a89a017ea4a2c492438055f05dfba3dfb4f91563f5f913359939beeaeccab
  design/scripts/cip/search.py: 6619fbbe71983003a858c5eb79bc59c607b342610a1178b6976c687c2932161b
  design/scripts/icon/generate.py: 1a6be99dc233f6d9f8b558c26148203418be5b47c677cd83e48e41e78e38780c
  design/scripts/logo/core.py: 4f8b36ffe538e5995d0e0b740053a0899a1adf445ffdf484bd47f94e71ade8d0
  design/scripts/logo/generate.py: a72e25d49e48fac6a1059d681a39c3f334c085f54ab90a88d1c9726edd079940
  design/scripts/logo/search.py: 693b3a1824831f120d4c60ed72477847604da1f6b654343381f8e9d3800a28f2
  slides/SKILL.md: 86c07f19ec09f79441d3837e909cfcd51034b83bdcc88094c15e652be1e765cb
  ui-styling/SKILL.md: 625e302c60ee8f2e22d56cbe638c4a739e2657f566dae42689503ad517c30f1e
  ui-styling/scripts/shadcn_add.py: 0c11d28ce9f12217df2c3306f24ae1f73527d5116db63707ab55cbe1a8bcf28c
  ui-styling/scripts/tailwind_config_gen.py: 9a81a5e2780650ab613a87d50ffd5caa9be22533f7bac0f8807a7f7214f26471
  ui-ux-pro-max/SKILL.md: ea087c341bfb5b23195c7302027268ede86da802554c18a5c4896a6017b439f9
  ui-ux-pro-max/scripts/core.py: c3be4b23e7150e6b45095213158cfa3c8ad96502f01dde3f6ffff9de64a4f481
  ui-ux-pro-max/scripts/design_system.py: e7d1c94c4b2eada17c5551157668362659ccf9626d34dbd58e68142410f90103
  ui-ux-pro-max/scripts/reasoning_contract.py: b8bac1af82aa280d3e06f00aabaeac4337e632996b07fed874e2b6ee6e9c5913
  ui-ux-pro-max/scripts/search.py: d54e648fe0ec2932cac66684220cc17be4bd4b4eba1d23d3195d509d398db374
  ui-ux-pro-max/scripts/validate_data.py: a599aa256049cf30954d1f164721b99e453eb7e4cb8241bcab2d5573e6cf58b8
---

## 这是什么

本目录是上游 `ui-ux-pro-max-skill` 仓库 `.claude/skills/` 下 7 个 skill 资产的**原样副本**
（只按上面 `trimmed` 规则裁掉非运行时资产，不改写任何被收录文件的字节）。
包内这份副本是运行时唯一事实源：subagent 从物化副本读取，不依赖网络与上游仓库。

## 许可

上游以 MIT 许可发布，版权声明：

> Copyright (c) 2024 Next Level Builder

（出处：<https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/LICENSE>）

## 如何刷新

```
node scripts/vendor-skills.mjs            # 默认源 /tmp/uupm/repo
node scripts/vendor-skills.mjs --from <repo>
```

刷新会重写 `skills/<skill>/`（仅本脚本管理的 7 个）与本文件；源 commit 与基线不一致会响亮失败。

## 如何发现漂移

```
node scripts/vendor-skills.mjs --check
```

不写盘：重算 `sha256` 清单（含缺文件/多文件）、比对 `skills` 与实际一级子目录、
复核 `<pkg>/skills` 合计 ≤ 5MB。任何不一致打印差异到 stderr 并 `exit 1`——
所以"手改了一个 vendored 文件"不会静默通过。
