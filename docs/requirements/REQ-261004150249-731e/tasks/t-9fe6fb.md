# t-9fe6fb 交接写原子化：席位升降 + sourceSessionId + 留痕·复核

> 需求：REQ-261004150249-731e 交接owner是什么意思

## 在做什么
交接写原子化：席位升降 + sourceSessionId + 留痕·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T07:51:30.053Z，窗口 session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561）

复核段：三条不变量（至少一个 owner、席位与绑定同指一窗、交接前后恰好一个 owner）逐条有断言，无偏离。

### 完成项

- 对照 design/data-model.md 的 INV-1/2/3 逐条核对实现与断言
- 确认「原窗口降 observer 而非退席」与设计一致
- 确认静态断言（sourceSessionId 直写唯一入口）未被绕开

### 改动文件

- `src/application/internal/binding-write.ts`

### 下一步

测试段

---
