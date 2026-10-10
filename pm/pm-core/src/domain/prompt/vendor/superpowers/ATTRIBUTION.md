# superpowers vendor 原文 · 来源与许可（REQ-422af1 t7）

本目录下的 14 份 `<skill>/SKILL.md` 是 **obra/superpowers** 的原文（逐字节落盘、不改写）。
其中 2 份仍是六节点 heavy 档的"主 skill 原文"（见 §3 镜像清单），brainstorming / writing-plans /
executing-plans 三份已**留档不再注入**（见 §2 本仓角色列）。它们**不是**运行时读盘对象：构建期由
`scripts/inline-prompt-fragments.mjs` 把 `fragments/<stage>/heavy.md`（镜像映射内的逐字节镜像）内联进
`src/domain/prompt/generated/fragments.ts`，运行时只读内存常量。

## 1. 来源

| 项 | 值 |
|----|----|
| 仓库 | https://github.com/obra/superpowers.git |
| 引用 | `origin/main` |
| commit | `8ca22dba9a94f28898bbce59f2537ff4d87c747d` |
| tag | `v6.4.2` |
| 许可 | MIT（Copyright (c) 2025 Jesse Vincent） |
| 抓取时点 | 2026-10-08 18:42:16 CST |
| 抓取方式 | `cp /Users/mac/Documents/ai/skills/superpowers/skills/<name>/SKILL.md`（该 checkout 的 HEAD = tag v6.4.2，逐字节复制，无任何改写） |
| 核对 | `git -C /Users/mac/Documents/ai/skills/superpowers log -1 --format=%H` = 8ca22dba9a94f28898bbce59f2537ff4d87c747d；`git tag --points-at HEAD` = v6.4.2；`git remote -v` = git@github.com:obra/superpowers.git |

## 2. 落盘清单（14 份 = 仓库 skills/ 全量）

| skill | 字节数 | 行数 | 本仓角色 |
|-------|-------:|-----:|----------|
| brainstorming | 17548 | 285 | **留档原文，不再注入**（2026-10-08 裁定：其"澄清→提方案→分段呈现设计"流程与本仓阶段边界冲突——设计属 design 节点；heavy 改本仓自写完整档，见 `fragments/brainstorming/heavy.md`） |
| writing-plans | 10335 | 204 | **留档原文，不再注入**（2026-09-21 裁定：设计阶段只写设计文档、不写计划；heavy 改本仓自写档，写计划纪律迁往 decomposing 档） |
| executing-plans | 20405 | 373 | **留档原文，不再注入**（2026-10-08 裁定，REQ-261008190515-5212：上游 v6.4.2 改为 inline 执行专版、明说不派子代理，与本仓任务卡 + 子代理的实施模式相冲；heavy 改本仓自写完整档，见 `fragments/implementing/heavy.md`） |
| verification-before-completion | 3646 | 120 | **heavy 主 skill**：accepting |
| finishing-a-development-branch | 7781 | 225 | **heavy 主 skill**：archived |
| test-driven-development | 9578 | 330 | 按需片段（implementing，同一次注入最多挂一个） |
| subagent-driven-development | 32577 | 568 | 按需片段（implementing） |
| using-git-worktrees | 6813 | 167 | 按需片段（implementing） |
| dispatching-parallel-agents | 6078 | 167 | 按需片段（implementing） |
| requesting-code-review | 2977 | 95 | 按需片段（accepting） |
| receiving-code-review | 6203 | 205 | 按需片段（accepting） |
| systematic-debugging | 9465 | 283 | 横切（排障场景） |
| writing-skills | 26623 | 681 | 横切（写提示词本身） |
| using-superpowers | 3192 | 65 | 横切（先分类宣布的元纪律） |

> **decomposing 无对应**：14 份里没有"拆分/任务 DAG/卡质量"的 skill（对照结论 §4.5 口径例外），
> 其 heavy 为自写完整档，不做"与 vendor 原文逐字一致"断言。
>
> **按需片段（附属 skill）**本阶段只落盘原文、不注册为分片：注册即需被路由命中（否则违反
> 门禁 4"无孤岛"）。待其在节点内子步骤上被 include 时再注册。

## 3. 逐字一致门禁（防漂移）

镜像映射（`VENDOR_MAIN_SKILLS`）内的 `fragments/<stage>/heavy.md` 是上表 2 份**主 skill 原文的镜像**，必须与 vendor 原文逐字节一致：

- 构建/同步门禁：`node scripts/check-prompt-fragments.mjs`（不一致即 exit 1）；
- 验收测试：`tests/prompt-tiers.test.ts`（映射内各节点 heavy 与 vendor 原文逐字一致，byte-level）。

镜像关系（唯一映射见 `scripts/inline-prompt-fragments.mjs` 的 `VENDOR_MAIN_SKILLS`）：
accepting→verification-before-completion；archived→finishing-a-development-branch。
（brainstorming→brainstorming 于 2026-10-08 移除、design→writing-plans 于 2026-09-21 移除、
implementing→executing-plans 于 2026-10-08 移除（REQ-261008190515-5212：上游 v6.4.2 改为 inline
执行专版、明说不派子代理，与本仓任务卡 + 子代理模式相冲），三者 heavy 改本仓自写完整档，
不做逐字一致断言。）

## 4. 许可原文（MIT）

```
MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
