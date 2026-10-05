# t-fff008 写自检 kb-probe（K1–K9 九项防腐）·复核

> 需求：REQ-261001110934-3766 代码知识库能力调研：降 token + 快速理解项目

## 在做什么
写自检 kb-probe（K1–K9 九项防腐）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对设计与实现的偏离逐条给出结论；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-01T05:02:00.670Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

六种「知识层坏了」的样子都演过一遍，每种都会红着退出并指出是哪条坏了——体检不是摆设。

### 完成项

- 六类故障注入各非零退出并指出 id / 行号：非法行、死链、孤儿、stale、生成物漂移、规范校验目标缺失
- 干净仓库退出码 0；还原后回到 0
- 可复跑驱动：evidence/probe-fault-injection.py（python3 直跑）
- 证据：evidence/t9-probe-fault-injection.txt

### 改动文件

- `docs/requirements/REQ-261001110934-3766/evidence/probe-fault-injection.py`
- `docs/requirements/REQ-261001110934-3766/evidence/t9-probe-fault-injection.txt`

### 下一步

复核：检查项与设计对照

---
