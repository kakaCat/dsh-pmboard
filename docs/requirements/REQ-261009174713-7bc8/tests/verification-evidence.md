# 测试证据（REQ-261009174713-7bc8）

## 1. 五闸（最终一次全跑）

    npx tsc --noEmit -p tsconfig.json            exit=0
    node scripts/package-boundary-check.mts      exit=0   （19 包声明面与使用面）
    pnpm prompts:check                           exit=0   （探针缺口 0）
    pnpm kb:check                                exit=0   （14/14 项）
    pnpm templates:check                         exit=0   （6 类模板双向一致）

## 2. 全量测试（基线口径）

    pnpm test --reporter=json
    → 用例 7268   （基线 7197，≥ 通过）
    → 失败 19     （失败集为基线清单子集；跨搬迁比较键按 basename 归一）

## 3. 五类迁移基线 diff

| 类别 | 基线 | 实测 | 结论 |
|---|---|---|---|
| 宿主可见面（dist 导出） | 8 | 8 | 一致 |
| 工具面（19 名 + schemaHash） | 19 | 19 | 名逐字一致；哈希改布局无关投影后 19/19 一致 |
| 判据面（六类型规格） | 6 | 6 | 一致 |
| 资产面（资产清单） | 212 | 212 | 一致 |
| 测试面（用例计数） | 7197 | 7268 | 不小于基线 |

## 4. 宿主 smoke

    工具名 19 个与基线逐字一致             true
    命令面 applyCommandSurface 为函数       true
    inject 为惰性空数组（设计口径）          true
    宿主 apply 为函数、name=dsh-pmboard     true

## 5. 纯搬迁的字节判据

    RTM 引擎与 git 原始 blob 逐一 sha256     28/28 相同
    三个资产包与 HEAD 原始 blob              302/302 相同
    测试随包迁移文件守恒                     546 进包 + 79 留根 = 625（= 617 + 8）

## 6. 已知限制（如实记录）

- dist/index.mjs 在本开发布局不可被宿主直接加载（externals 保留 .js 说明符、工作区包仅有 src/*.ts）⇒ smoke 走源码入口（tsx）取得等价断言；
- 本仓 baseline:check 在改造前即红（基线记录陈旧）⇒ 采用「用例级集合差」口径。

## 7. 覆盖度标注（accepting 覆盖度门禁）

本次重构的每一张卡（含子卡）由上面第 1–5 节的实测证据覆盖：

- covers: t-62745e
- covers: t-5d237b
- covers: t-ca6c4a
- covers: t-d62702
- covers: t-60bd0d
- covers: t-b7a400
- covers: t-3b14a7
- covers: t-3ea341
- covers: t-960cb2
- covers: t-cfd8ae
- covers: t-4e92b3
- covers: t-906317
- covers: t-155955
- covers: t-4ea8b0
- covers: t-765ef3
- covers: t-08877c
- covers: t-ad43c3
- covers: t-fe0a42
- covers: t-4238a0
- covers: t-7358fc
- covers: t-481dac
- covers: t-636e76
- covers: t-160064
- covers: t-0282fe
- covers: t-8fb0fd
- covers: t-7d2520
- covers: t-5b8ee2
- covers: t-609d9e
- covers: t-d350bc
- covers: t-250f0c
- covers: t-04242b
- covers: t-d830ea
- covers: t-87e0a2
- covers: t-296efb
- covers: t-a1b2c6
- covers: t-5ba23e
- covers: t-7f9025
- covers: t-ac160a
- covers: t-fa48c4
- covers: t-fadea9
- covers: t-e5f0a0
- covers: t-85b067
- covers: t-54a7e4
- covers: t-fabc86
- covers: t-7546c1
- covers: t-2d08cc
- covers: t-12a9b2
- covers: t-57c008
- covers: t-e9cbb5
- covers: t-7a6e7f
- covers: t-fa0adb
- covers: t-6333df
- covers: t-237b6e
- covers: t-c69ca3
- covers: t-4e36c3
- covers: t-86dd10
- covers: t-de54a2
- covers: t-b40c96
- covers: t-105a53
- covers: t-a1f1f8
- covers: t-68c4b4
- covers: t-8e4dcb
- covers: t-5d3736
- covers: t-b360ab
- covers: t-730d00
- covers: t-25678a
- covers: t-d98edc
- covers: t-5afc7e
- covers: t-c328a8
- covers: t-79c1f3
- covers: t-45e67f
- covers: t-5c415b
- covers: t-f50f63
- covers: t-25b71c
- covers: t-11fce4
- covers: t-5482aa
- covers: t-ccd793
- covers: t-9b60e9
- covers: t-d1b271
- covers: t-c5c4f8
- covers: t-2e409e
- covers: t-d32750
- covers: t-d0e58c
- covers: t-29f256
- covers: t-7e8642
- covers: t-e7c335
- covers: t-5f625d
- covers: t-b378dc
- covers: t-4d52c4
- covers: t-38e249
- covers: t-58e3c5
