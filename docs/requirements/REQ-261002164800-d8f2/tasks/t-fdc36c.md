# t-fdc36c 取数单点：refsForLanding 合并显式与文档覆盖表·联调

> 需求：REQ-261002164800-d8f2 修复计划落库 refs 断链：门禁不对称 + 计划通道丢字段 + 无补写入口

## 在做什么
取数单点：refsForLanding 合并显式与文档覆盖表·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-02T09:07:06.012Z，窗口 session-fcfe356b-c62e-48cd-aee7-a94245188531）

联调核对：两条落库入口确实都走同一个取数函数，缺引用的卡在两条回执里都能看见

### 完成项

- 两条入口都经单点函数：confirm-settle.ts:294 与 Decompose.ts:189 各一处调用，无第二处组装
- decompose 回执新增 unrefed_cards 与 refs_warning：缺引用的卡在返回体里点名
- 批准路径回执也点名（autoNote 追加警告），不再静默落一批无引用的卡
- 相关既有面 192 项跑过：3 项失败与改动前同一断言（plan-mode 221 / auto-chain 82 / t17 130），属既有基线
- 跨窗如实报：tests/reqboard/store-contract.test.ts 因另一窗口在途文件 ShardedRequirementStore.ts 语法错误无法收集，与本卡无关

### 下一步

交复核子卡：逐处对照设计并登记偏离

---
