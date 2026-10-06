# t-d6a19e 逆验证矩阵（14 条改坏必红）与端到端证据清单·研发

> 需求：REQ-261005193546-1b1a 看板 DAG 不再展示已取消卡：让视图与统计都不再算上退出赛道的卡片

## 在做什么
逆验证矩阵（14 条改坏必红）与端到端证据清单·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T17:42:26.544Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

研发段完成：14 条逆验证矩阵落地，每条都真跑判据并逐字节还原；端到端证据文件成稿。

### 完成项

- canceled 组 14 条 drill 全部必红并逐字节还原（脚本外独立 sha256 复核）
- 每条标了「行为断言 / 源码锚点」；C2/C3 是源码锚点（行为等价，只有锚点红）
- 范围自检：target 改成不存在路径 → 脚本 exit 1 且零演练输出
- 新增覆盖度用例 7 条断言（条目数 14、target 集合恰好 9 文件、git checkout 命中 0）
- 落 notes/e2e-evidence.md（216 行）：一条命令复现表 + 原始输出 + 还原凭据 + 两条限定语

### 改动文件

- `scripts/reverse-drill-matrix.mts`
- `tests/canceled-reverse-drill-coverage.test.ts`
- `docs/requirements/REQ-261005193546-1b1a/notes/e2e-evidence.md`

### 下一步

复核段：两串 14 条的映射、锚点标注与既有用例脆弱性

---
