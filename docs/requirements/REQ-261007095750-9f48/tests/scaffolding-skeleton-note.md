# 脚手架骨架原型：发现、证据与处置（REQ-261007095750-9f48）

covers: t-3948f1

## 1. 发现

本需求 `requirement.md` 的 front-matter 是 `sides: []`（**无任何端侧改动**，不产生界面产物），
但立项脚手架在 `docs/requirements/REQ-261007095750-9f48/prototypes/` 下**自动生成了两份文件**：

```
prototypes/detail.html   （3829 bytes，2026-10-07 09:57 创建）
prototypes/INDEX.md      （419 bytes，内容声称：| prototypes/detail.html | authoritative | FR-1 |）
```

## 2. 证据：detail.html 就是骨架模板（不是人写的原型）

把需求号与标题替换回模板占位符后，与 `templates/brainstorming/prototype.html` 做 diff，
**只剩 2 处差异**（都是占位符替换本身，没有一处是人写的内容）：

```
$ diff <(sed 's/REQ-261007095750-9f48/<REQ>/g;s/<TITLE>/<TITLE>/g' prototypes/detail.html) templates/brainstorming/prototype.html
6c6
< <title><TITLE> · 原型（<REQ>）</title>
---
> <title>{{TITLE}} · 原型（{{REQ_ID}}）</title>
30c30
< <header><strong><TITLE></strong><span class="req"><REQ> · 原型 v0.1 · 2026-10-07</span></header>
---
> <header><strong>{{TITLE}}</strong><span class="req">{{REQ_ID}} · 原型 v0.1 · {{DATE}}</span></header>
```

⇒ 它**零信息**（与模板逐字节同构），但 `INDEX.md` 却把它标成 `authoritative` 并声称服务 `FR-1`。

## 3. 处置：删除，并说明理由

两份文件已删除。理由：

1. **本需求没有 UI**（`sides: []`）：保留一个"权威原型"会让看板/复核者以为存在界面交付物；
2. **它是骨架不是原型**：按本仓既有契约（骨架原型相似度 > 0.90 即判非原型，见知识库中
   「原型门与非骨架契约」条目），这类文件本身就是要被拦下的对象；
3. **它没有产物登记**：从未 `reqboard_submit(kind=prototype)` 登记，故删除不影响任何台账读数；
   验收单也不会因此出现 `prototype-compare` 项（该项只在 `sides` 含 `frontend` 时组装）。

## 4. 报出的缺陷（不在本需求范围，建议另行立项）

**立项/创建路径无条件生成骨架原型**：即使需求声明 `sides: []`（或 `sides` 里没有 `frontend`），
脚手架也会落下 `prototypes/detail.html` + 一份把它标成 `authoritative` 的 `INDEX.md`。
后果有二：① 每个非 UI 需求都会带一份"假的权威原型"；② 与「非骨架原型」判据的方向相反——
判据在拦骨架，脚手架却在造骨架。

建议：创建路径按 `sides`（或 category + 端侧）决定是否脚手架原型；至少在非 frontend 需求下不生成
`INDEX.md` 的 `authoritative` 行。本次只记录证据与删除，不改脚手架（不属本需求批准范围）。
