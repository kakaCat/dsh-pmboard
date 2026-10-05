# t3 证据：探针「各档可见 token ≥ 1」硬断言（REQ-261004143941-b2ca FR-4）

## 改了什么

| 文件 | 改动 |
|---|---|
| `scripts/header-progress-probe.mts` | ① 标本模型加 `tokenTotal: 24800000`；② 标本 DOM 在**计数之后、`.dsh-pm-flow` 之外**渲染累计徽章（与真组件同构）；③ 量布脚本统计 `.dsh-pm-cprog-token-total` / `.dsh-pm-cprog-token-ico` 的可见数；④ 新增断言：徽章恒为 1（各档）、`节点级 token + 徽章 ≥ 1`（新问题时码 `TOKENS_HIDDEN`）、档位 D 图标应收掉、其余档应留图标；⑤ DIAG 的 token 读数改为两段 `tokens=<节点级>+<徽章>`；⑥ 断言矩阵补 A7 |

## 绿态（6 档，退出码 0）

```
$ ./node_modules/.bin/tsx scripts/header-progress-probe.mts
DIAG frame=1280 viewport=1280 container=1232 tier=A nodes=7 links=6 tokens=2+1 labels=7 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=0..750 problems=NONE
DIAG frame=1024 viewport=1024 container=976  tier=B nodes=7 links=6 tokens=0+1 labels=7 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=0..750 problems=NONE
DIAG frame=900  viewport=900  container=852  tier=B nodes=7 links=6 tokens=0+1 labels=7 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=0..750 problems=NONE
DIAG frame=768  viewport=768  container=720  tier=C nodes=7 links=0 tokens=0+1 labels=1 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=0..750 problems=NONE
DIAG frame=640  viewport=640  container=592  tier=D nodes=7 links=0 tokens=0+1 labels=0 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=0..638 problems=NONE
DIAG frame=480  viewport=500  container=452  tier=D nodes=7 links=0 tokens=0+1 labels=0 rowRightOverflow=-12 docOverflow=0 rowScrollW=0 chartScrollX=0 panel=0..498 problems=NONE

PROBE PASS（6 档视口：标题行不溢出 / 档位可见集正确 / 当前节点恒可见 / 面板不越界）
```

读法：`tokens=<节点级>+<累计徽章>`。**B/C/D 档 `0+1`** —— 节点级明细按既有设计隐藏，
但累计读数恒在（这正是本需求要的结果）；不变量全部保持（行不溢出、零内部滚动、面板不越界）。

降级态（`--fallback`，无容器语义）同样 PASS：`evidence/t3-probe-fallback-green.txt`。

## 红态自证（断言不是装饰）

把标本里的 `tokenTotal: 24800000` 注释掉（模拟「没有累计读数」= 改造前的 B/C/D 档），再跑：

```
DIAG frame=1024 … tier=B … tokens=0+0 … problems=累计 token 徽章数 0 != 1 | 档位 B 累计 token 徽章不可见 | TOKENS_HIDDEN 档位 B 可见 token 总数 0 < 1 | …
PROBE FAIL
  - w=1024: TOKENS_HIDDEN 档位 B 可见 token 总数 0 < 1
  - w=900:  可见 token 总数 0 < 1（该档没有任何 token 读数）
  - w=640/480: TOKENS_HIDDEN 档位 D 可见 token 总数 0 < 1
退出码 1
```

完整红态：`evidence/t3-probe-red.txt`。红绿两份并存，避免「事后补装饰断言」。

**一处与计划的措辞偏差（如实记录）**：计划写「临时移除 `conversation-progress.ts` 的 tokenTotal 渲染分支」，
但探针是**离屏标本页**（自己按模型拼 HTML），改组件不影响它。故红态取等价做法：让**模型拿不到累计读数**
（注释掉标本的 `tokenTotal`）——语义相同（载荷/组件都不出这个数），且探针真会红。
组件自身的渲染分支由 `tests/header-progress-responsive.test.ts` 的 TC-2e 结构断言守住。

## 一个踩过的假红（留给后人）

第一版断言无条件要求「档位 D 图标被收掉」，降级态（无容器语义）直接红了两档（w=640/500）：
降级态本就"全量渲染"，档位规则一条都不生效，`tier` 只是按宽度算出的标签。
修法：图标断言加 `MODE !== 'fallback'` 门（宽窄档规则只在有容器语义时才有意义）。
