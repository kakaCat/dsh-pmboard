# t-b40da5 返工：与裁定对照（逐条说明如何落实）

> 需求：REQ-261006094052-1da2 确认门死锁：已落章未推进后 agent 无路可走

## 在做什么
返工：与裁定对照（逐条说明如何落实）

## 解决什么问题
承接自 裁定对照验收项（D-1、D-2、D-3、D-4、D-5、D-6、D-7）；验收意见：需修改

## 得到什么结果
与裁定对照（逐条说明如何落实）

---
## 汇报 1（2026-10-06T01:57:45.284Z，窗口 session-9d5750ad-47dc-4178-b33e-b6531daea6a6）

返工完成：补出 D-x 逐条落实对照（含落实点行号与证据），并把文档自检复跑结果同步进测试证据。

### 完成项

- 按验收意见补齐「与裁定对照（逐条说明如何落实）」
- 新增 reviews/decision-mapping.md：D-1~D-7 逐条给原话来源、落实点（文件:行）与可复核证据
- 补记实施期派生裁定 D-2′（G2 后门封堵）与 TC-9 证据
- 同步 tests/acceptance-evidence.md §5：文档自检复跑缺口 0（rtm-accepting.yml 已生成）

### 改动文件

- `docs/requirements/REQ-261006094052-1da2/reviews/decision-mapping.md`
- `docs/requirements/REQ-261006094052-1da2/tests/acceptance-evidence.md`

### 下一步

重新提交验收材料（v2 只含未过项 v1-7）

---
