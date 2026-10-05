# t-b6a6f5 探针改判据：可见集重写 + 三条新断言 + 红态自证·研发

> 需求：REQ-261004151652-d535 流程图每节点 token 在窄窗口也要看得到

## 在做什么
探针改判据：可见集重写 + 三条新断言 + 红态自证·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T07:31:19.178Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

这一步做完，回归哨兵学会了新规矩：只要有名字就该有数、明细让位就得交出总数、明细在时不许再显总数——三条都实测能红。

### 完成项

- 探针档位模型从四档收敛为两档（明细档 600 以上 / 紧凑档 600 及以下），期望集改为按可见集规则直接判定
- 新增三条断言，各自对着一种真实错法：有名字没数、明细隐却无总数、明细在却显总数
- 绿态：6 档 problems=NONE + 降级态 PASS（720 档从改造前的 0 个数变成 1 个数）
- 红态 A（把旧阈值 1000 的单藏 token 档加回来）：1024/900 档报 token 0 != 2、720 档报 TOKENS_HIDDEN_BESIDE_LABELS，退出码 1
- 红态 B（徽章改回常显）：宽档报 TOTAL_DUPLICATED，退出码 1；恢复后两模式回到退出码 0
- 顺带抓到并修掉一个真缺陷：分片拼接顺序（BASE→BOARD→TOKEN）让默认隐藏压过了窄档显示规则，显示规则加 .dsh-pm-cprog-inline 前缀提高特异性；单测同步断言前缀，并实测过去掉前缀必红
- 端到端包装（header-progress-e2e 2 用例）由红转绿，t1 留下的过渡态已闭环

### 改动文件

- `scripts/header-progress-probe.mts`
- `src/client/styles/board.ts`
- `tests/header-progress-responsive.test.ts`
- `docs/requirements/REQ-261004151652-d535/evidence/t2-evidence.md`
- `docs/requirements/REQ-261004151652-d535/evidence/t2-probe-green.txt`
- `docs/requirements/REQ-261004151652-d535/evidence/t2-probe-fallback-green.txt`
- `docs/requirements/REQ-261004151652-d535/evidence/t2-probe-red-token1000.txt`
- `docs/requirements/REQ-261004151652-d535/evidence/t2-probe-red-badge-always.txt`

---
