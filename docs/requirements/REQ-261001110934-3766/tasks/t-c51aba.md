# t-c51aba 定知识层领域模型与索引语法（纯函数单点）·研发

> 需求：REQ-261001110934-3766 代码知识库能力调研：降 token + 快速理解项目

## 在做什么
定知识层领域模型与索引语法（纯函数单点）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/kb-domain.test.ts → 25 passed；且 ls src/domain/knowledge/{types,budget,slug,index-line,entry}.ts 五个文件存在

## 汇报 1（2026-10-01T04:13:45.002Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

知识层有了「唯一语法单点」：索引行与条目文档的解析/渲染、id 形态、锚点与切节、预算判定都在 domain 落地并被 25 条用例锁死——后续写入端、读取端与校验端从此共用同一套口径，不会再出现两处实现各自漂移。

### 完成项

- 8 类知识域枚举与两种 id 形态判定（kb-NNNN / kb-<页面>-<锚点>）
- 索引行唯一解析口径：parse/render 往返相等，非法行与伪 id 抛错带行号
- 整档解析 parseIndexDoc：重复 id / 语法非法 / 未知分节 / 顺序错乱 / 缺分节 / 节与 kind 不匹配一次报全
- 预算结构化溢出：8001 字符、201 行返回 KbOverflow（不静默裁剪）
- 锚点与切节：三级锚点回落、uniqueSlug 去重、sliceSection 只取该节、找不到返回 undefined
- 条目文档：扁平标量头 render/parse 往返、需要引号的值可还原、嵌套/未知/缺必填抛错
- 日期纯函数：addDays / defaultExpires / isExpired / isIsoDate（不读系统时间）
- 25 条单测全绿；tsc 对新增文件 0 错误

### 改动文件

- `src/domain/knowledge/types.ts`
- `src/domain/knowledge/budget.ts`
- `src/domain/knowledge/slug.ts`
- `src/domain/knowledge/index-line.ts`
- `src/domain/knowledge/entry.ts`
- `tests/kb-domain.test.ts`

### 下一步

t2 定 KnowledgePort 与文件实现（读写 docs/knowledge）

---
