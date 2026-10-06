# t-d906fe 定义资产/manifest 契约与 skills 配置开关·研发

> 需求：REQ-261005122347-e07a 需求分析阶段：收录 UI 提示词（MIT）并按引用交付原型 subagent

## 在做什么
定义资产/manifest 契约与 skills 配置开关·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T04:43:04.965Z，窗口 session-6caf9382-cd78-46cf-a397-d723c7103292）

这一步做完，skill 资产有了可机器比对的「指纹 + 清单」契约：插件自带一份资产说明（PROVENANCE），投放出去时另带一份清点单（manifest），两边都能被程序逐文件核对，谁偷偷改了内容都会当场变红，而不是等到子代理读到混版资产才发现。

### 完成项

- 新增 skill 清单契约模块：建立清单、比对清单、按指纹核对自带资产说明
- 自带资产说明可被解析；缺字段、空指纹、front-matter 未闭合一律抛错，不静默放过
- 新增两个端口：读包内资产、投放写盘与解释器探测（探测是全插件唯一碰python的点）
- 新增 skills 开关解析：缺省开启；开关写成非布尔或路径非绝对，装配期就抛错
- 新增 17 条用例：自带资产说明逐文件核对全一致；改哈希/删文件/多文件/清单版本不认识 分别判红
- 反向演练已内建：篡改判定与真实判定走同一条代码路径，不是另写一套断言
- 自测：npx vitest run tests/skills-provenance.test.ts → 17 passed
- 自测：npx tsc --noEmit 错误数 1（与开工基线同为 1，新增 0）

### 改动文件

- `src/application/internal/skill-manifest.ts`
- `src/application/ports.ts`
- `src/plugin-config.ts`
- `tests/skills-provenance.test.ts`

### 下一步

本卡联调：与 t-1cf5ef 的资产一同跑；复核阶段需正视 tests/layer-boundary.test.ts 的既有 16 条越界（均为存量，本卡新增模块 0 条）

---
