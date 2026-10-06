# t-bb42b1 建立集合差基线判据与指纹采集·测试

> 需求：REQ-261006123819-3af3 审计优化·前 5 条落地（提交工作树 / 契约映射 / 基线口径 / 死字段 / 知识层自检）

## 在做什么
建立集合差基线判据与指纹采集·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T05:31:02.795Z，窗口 session-1032484b-962a-4cc0-b83a-5454c4e2ea80）

t1 测试段完成：集合差判据的正反序列与判别器双向全部实测通过 —— 一致时 exit 0、注入失败用例时 exit 1 并点名、缺基线时快速失败、还原后复绿；tsc 0 错误。另刻画出一条重要事实：全量套件存在顺序相关偶发失败（settings-init 单独跑 5/5 全绿、canceled-legacy-read 单独跑 15/15 全绿），判别器能当场把这类幻影标出来，避免误报成新增失败。

### 完成项

- 判据正例：npx tsx scripts/test-baseline.mts --check → 本次失败 68 条 · 基线 68 条、差集「新增 0 / 不再失败 0」、test-baseline: OK、exit 0（连续两次复跑同为 exit 0）
- 判据反例：注入一条故意失败用例 → exit 1，且「新增失败」栏逐条点名 tests/__baseline_probe__.test.ts :: 基线探针（临时，跑完即删）这条用例故意失败以验证集合差判据能点名新增失败
- 还原复绿：删除探针文件后 --check → exit 0、差集 0；残留检查确认探针文件不存在
- RV-5 缺基线：移走 docs/reviews/test-baseline.failures.txt → --check 快速失败 exit 1 并报「没有基线，先 refresh」（并明确不得当作通过），还原后 68 行完好、复跑 exit 0
- 判别器双向验证：注入的探针被标为 [真新增]（单独跑 1 failed）；同一次运行里 tests/canceled-legacy-read.test.ts 被标为 [顺序相关？]（单独跑 15 passed）
- 顺序相关用例刻画：tests/reqboard/settings-init.test.ts 单独跑 5 次全绿（17 passed / 17 passed / 17 passed / 17 passed / 17 passed），却在某一次全量里失败一次（连续 3 次全量中观察到 1 次）
- 类型检查：npx tsc --noEmit -p tsconfig.json → 退出码 0、error TS 0 条（与基线一致）
- 全量口径：失败 68 条 / 共 6024 用例（通过 5956），文件 37 failed / 471 passed
- 知识层门禁：npx tsx scripts/kb-conventions-sync.mts --check → exit 0（覆盖度与清单一致、零缺口零漂移）；npx tsx scripts/kb-probe.mts 的 K10 不再报 scripts 未归类，只剩既有的 C-27 占位
- 未新增红（本卡范围）：K7 生成物漂移在任意 src 改动后都会变红（本次因 src/domain 字符数变化），需 kb-build --write 重生成，修复归属 t5 的 FR-4 面，非本卡引入的缺陷
- 本卡不含独立测试文件：交付物是判据脚本本身，其正确性由上述 RV-5 / TC-11 正反序列与判别器双向验证承担；子卡模板里「失败数 ≤ 开工前基线」仍是旧的计数上限口径，而本卡给的是更强的集合相等（差集 0）

### 改动文件

- `docs/requirements/REQ-261006123819-3af3/tasks/t-bb42b1.md`

### 下一步

父卡 t-1f7453 收尾；并把两条待办带给后续卡：① 基线 md 第 13 行命令行待 t6 同步为 pnpm baseline:refresh 形式；② 子卡测试模板的「失败数 ≤ 基线」措辞与 C-14 新口径不一致，建议另立小项收敛。

---
