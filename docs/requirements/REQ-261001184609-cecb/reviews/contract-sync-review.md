---
req: REQ-261001184609-cecb
doc: review
serves: FR-1, FR-2, FR-3
---

# 复盘：契约三处同步（本轮唯一的返工）

## 事实

FR-1 的字段散在**三处**：domain 的 SheetItemLike、protocol.VerificationItem、client/types 的 VerificationItem。
我第一版只改了 domain 那一处，结果 tsc 从 212 变 216、弹框拿到的是没有字段的类型——是编译器和用例把我拦住的，不是我自己发现的。

## 为什么会漏

拆分计划里 t1 的验收标准写的是「契约字段可读写」，**没有写清有几处契约要同步**。卡写不严，执行的人（我）就先踩了。

## 处理

t6 回归卡里加了**契约三处同步锁**（类型断言 HasAll）：任一处漏字段，测试文件直接编译失败、跑不起来。
把「靠记性」换成「靠编译」，这类漏项不会再发生第二次。
