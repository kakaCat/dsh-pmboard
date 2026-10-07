# t-0ef7ef 堵掉四处仍在写真实工作树的测试点位·复核

> 需求：REQ-261006201814-ac4f 测试反向与异常覆盖补强（错误码矩阵 / 红基线分诊 / hermetic 夹具）

## 在做什么
堵掉四处仍在写真实工作树的测试点位·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T04:51:31.610Z，窗口 session-ec318e7e-5a51-4037-96c2-d70aced8a3ff）

复核通过：四处改法与夹具落点一致，新增写入口为零，沙箱下全绿且零残留。

### 完成项

- 复核对象：四处泄漏点位的改法是否与夹具落点一致、有无引入新写入口
- 核对一：stubDocFile 的落点 = resolveWorkspaceRoot()，rmSync 现与之一致（改前清的是仓库路径，清不掉真文件）
- 核对二：rtm-health 与 capture-hook 的根均改走 testWorkspaceRoot()，与单一事实源同源
- 核对三：沙箱开启下四文件 53 用例全绿，未出现 ERR_ACCESS_DENIED
- 核对四：git status 中 .test-rtm-health 命中 0，残留归零
- 无偏离项：与 design 的 interfaces（测试根单一事实源）与 FR-5 三层结构一致

### 下一步

关 u3；继续 u4/u2 等批次内卡。

---
