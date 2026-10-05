# t2 证据：探针改判据（REQ-261004151652-d535 FR-4）

## 改了什么

`scripts/header-progress-probe.mts`：档位模型从四档（A/B/C/D）收敛为**两档**（`detail` / `compact`，分界 = `FLOW_TIERS.token = 600`），
期望集改为按「可见集规则」直接判定，并新增三条对着真实错法的断言：

| 断言码 | 触发条件 | 它防的是 |
|---|---|---|
| `TOKENS_HIDDEN_BESIDE_LABELS` | 中档（600<容器≤780）当前节点名可见但它的数不可见 | **本需求的原病**：有名字没数 |
| `TOTAL_MISSING` | 紧凑档（容器≤600）累计徽章不可见 | 明细让位了却没交出总数（降级漏给） |
| `TOTAL_DUPLICATED` | 明细档累计徽章仍可见 | 明细与总数重复显示（信息冗余） |

## 绿态（6 档 + 降级，退出码 0）

```
$ ./node_modules/.bin/tsx scripts/header-progress-probe.mts
DIAG frame=1280 … container=1232 tier=detail  nodes=7 links=6 tokens=2+0 labels=7 … problems=NONE
DIAG frame=1024 … container=976  tier=detail  nodes=7 links=6 tokens=2+0 labels=7 … problems=NONE
DIAG frame=900  … container=852  tier=detail  nodes=7 links=6 tokens=2+0 labels=7 … problems=NONE
DIAG frame=768  … container=720  tier=detail  nodes=7 links=0 tokens=1+0 labels=1 … problems=NONE   ← 中档：只剩当前节点，但它带着自己的数
DIAG frame=640  … container=592  tier=compact nodes=7 links=0 tokens=0+1 labels=0 … problems=NONE   ← 紧凑档：明细让位、总数交出
DIAG frame=480  … container=500? tier=compact nodes=7 links=0 tokens=0+1 labels=0 … problems=NONE
PROBE PASS
```
读法：`tokens=<节点级可见数>+<累计徽章可见数>`。对照组是**改造前**的同一探针（旧期望集）：
976/852/720 档恒为 `0+1` 或 `0+0` —— 节点级明细在窄窗口一个都看不到。

降级态（`--fallback`）同样 PASS：全明细可见 + 徽章隐藏（`evidence/t2-probe-fallback-green.txt`）。

## 红态自证（两条，各自可复现）

**红 A：把旧阈值 1000 的「只藏 token」档加回来**（复现原病）
```
$ ./node_modules/.bin/tsx scripts/header-progress-probe.mts      # 临时插入 @container (max-width:1000px){ .dsh-pm-flow-token{display:none} }
DIAG frame=1024 … container=976 … tokens=0+0 labels=7 … problems=明细宽档节点 token 0 != 2
DIAG frame=768  … container=720 … tokens=0+0 labels=1 … problems=TOKENS_HIDDEN_BESIDE_LABELS 中档当前节点名在但它的数不在（可见 0）
PROBE FAIL  退出码 1
```
完整输出：`evidence/t2-probe-red-token1000.txt`。注意 720 档报的正是**原病**。

**红 B：换算徽章为常显**（复现「明细与总数重复」）
```
$ ./node_modules/.bin/tsx scripts/header-progress-probe.mts      # 临时去掉 TOKEN_CSS 里的默认 display:none
DIAG frame=1280 … tokens=2+1 … problems=TOTAL_DUPLICATED 明细档累计徽章应隐藏，实际可见 1
PROBE FAIL  退出码 1
```
完整输出：`evidence/t2-probe-red-badge-always.txt`。恢复后两模式均回到 exit 0。

## 顺带抓到的一个真缺陷（已修，值得记住）

第一版把「窄档显示徽章」写成 `.dsh-pm-cprog-token-total { display: inline-flex }`，
探针立刻报 `TOTAL_MISSING`——**分片拼接顺序是 BASE → BOARD → TOKEN**，
TOKEN_CSS 里的默认 `display: none` 与之同特异性时「后被追加者胜」，把显示规则压住了。
修法：显示规则带 `.dsh-pm-cprog-inline` 前缀提高特异性；单测 TC-2f 同步断言该前缀，
并**实测过**去掉前缀 TC-2f 必红（22 → 1 failed → 恢复后 22 全绿）。
