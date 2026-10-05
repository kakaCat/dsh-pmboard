# t-f7baff 落地「在途弹框登记 + 停手位」契约·联调

> 需求：REQ-261002141430-a5ef 弹框在途即停手：PM 弹框出现时写 Dive 暂停态、作答后恢复

## 在做什么
落地「在途弹框登记 + 停手位」契约·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-02T06:33:16.884Z，窗口 session-0dc94a2a-9c00-455b-ac58-f96624a21da2）

这一步做完：「有弹框在等」这件事第一次被装配到了生产组合根上，而未装配时行为与改动前完全一致（向后兼容有据）。

### 完成项

- 组合根把同一个注册表实例同时接给 pendingConfirms 与 dialogs（两种视图一张表）
- UseCaseDeps 新增可选 dialogs 端口：缺省即零行为，行为与改动前逐字一致
- 接口契约按实现回写设计文档（enter/exit 返回 Promise 且永不 reject、ref 可选）

### 改动文件

- `src/index.ts`
- `src/application/ports.ts`
- `docs/requirements/REQ-261002141430-a5ef/design/interfaces.md`

### 下一步

复核段：逐条核对契约

---
