# t-f5a28b 给人一个开关：看板继续能接回手动模式的需求·研发

> 需求：REQ-261002173819-69c7 修复 reqboard 自动化断链：Dive 无法重新武装 + 自动实施链投递失败

## 在做什么
给人一个开关：看板继续能接回手动模式的需求·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T10:11:27.544Z，窗口 session-c997b014-0c5c-4679-9439-98f6d0a3fc20）

看板「继续」现在真的能救人手动模式的需求：人按一下，需求从「我要手动跑」回到「自动跑」，Dive 一分钟内接上；而系统自己仍然不会去碰这个开关。

### 完成项

- 新增 armExplicit：人显式要继续时，把 disarmed+idle 的需求接回 armed+active（此前无任何入口）
- 自动路径一行未改：recoverHealth 与 rearmIfRecoverable 语义原样，仍不碰手动模式
- 看板「继续」改调 armExplicit，并把 note 文案从「检测到误停摆」改为「人显式要继续」
- 幂等：已 armed 且健康时零写入；弹框在途时一律不动（不越权）
- 留痕区分来源：人工留痕 createdBy=human，与自动恢复的 system 留痕一眼可分
- 新增 R-1..R-7 七例（dive-rearm 24 例全绿）与 R-8/R-9 两例（路由级，含「不新增返回键」断言）
- 类型检查 187 条与本卡改动前同数，无新增错误

### 改动文件

- `src/application/internal/rearm.ts`
- `src/http/routers/requirements.ts`
- `tests/dive-rearm.test.ts`
- `tests/reqboard/autorun-rearm.test.ts`

### 下一步

联调子卡：核对看板请求到台账落章的整条链路与响应形状

---
