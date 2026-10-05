# t-4c49aa 兼容降级与回滚面核对 + 证据归档·研发

> 需求：REQ-260930194112-1ab8 列表视图自适应修复：窄宽度下列被压缩换行、操作按钮重叠

## 在做什么
兼容降级与回滚面核对 + 证据归档·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

跑 `git status --porcelain -- src/client/views/board.ts src/client/styles/board.ts tests/list-responsive.test.ts scripts/list-responsive-probe.mts package.json` → 恰好 2 个 M + 2 个 ??、package.json 无输出；再跑 `ls docs/requirements/REQ-260930194112-1ab8/evidence/*.png | wc -l` → 5。

## 汇报 1（2026-09-30T14:23:33.723Z，窗口 session-c1999330-7372-45da-b999-171621fa17bb）

这一步做完，交付是**可被第三方复核**的：五张截图（修复前症状 + 四个宽度档的修复后）都在需求目录里，改动面精确到「改 2 个文件、不动依赖」，出问题只需还原这 2 个文件即可回到原样。

### 完成项

- 证据归档：evidence/ 收 5 张图（before-840 修复前症状 + after-640/840/1080/1680 修复后各档），after 四张由**当前源码**渲染（非注入样式），尺寸 840x520 / 640x520 / 840x520 / 1080x520 / 1680x520
- 改动面核对：git status --porcelain（按文件限定）恰好 2 个 M（views/board.ts、styles/board.ts）+ 2 个 ??（tests/list-responsive.test.ts、scripts/list-responsive-probe.mts），package.json 与 pnpm-lock.yaml 无输出（无依赖变更）
- diff 规模：git diff --stat 仅这两个源文件，board.ts 11 行（6 增 5 改）、styles/board.ts 40 行纯增
- 兼容降级核对（D-3）：只用到 white-space / overflow-x / min-width:max-content / @media 四类特性，不支持时的行为均退回现状或可用子集，无更差路径
- 回滚路径核对（D-4）：无数据迁移、无开关、无回填；回滚=还原这 2 个源文件（新增的测试/探针/证据不参与运行时）

### 改动文件

- `docs/requirements/REQ-260930194112-1ab8/evidence/before-840.png`
- `docs/requirements/REQ-260930194112-1ab8/evidence/after-640.png`
- `docs/requirements/REQ-260930194112-1ab8/evidence/after-840.png`
- `docs/requirements/REQ-260930194112-1ab8/evidence/after-1080.png`
- `docs/requirements/REQ-260930194112-1ab8/evidence/after-1680.png`

### 下一步

复核子卡核对证据与结论一致性，并确认 1680px 宽档与修复前逐项一致

---
