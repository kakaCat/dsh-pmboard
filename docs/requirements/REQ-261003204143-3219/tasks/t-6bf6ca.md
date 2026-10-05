# t-6bf6ca 验证契约用例能抓住漂移（复现卡）·分析

> 需求：REQ-261003204143-3219 修复 reqboard_capture 弹框答案契约：answers.workspace 未声明导致立项必炸

## 在做什么
验证契约用例能抓住漂移（复现卡）·分析

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
结论含置信度与适用边界，并列出被证伪的假设（附支撑数据的命令或 `docs/requirements/<REQ>/` 下证据路径）

---
## 汇报 1（2026-10-03T13:41:44.708Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

分析结论：tests/capture-output-contract.test.ts 对「schema 漏声明 answers 嵌套键」这一漂移形态具备判定力（成功/取消两路径均红、违例点名精确到 answers.workspace）；边界=只管嵌套层，顶层键归静态扫描

### 完成项

- 结论：契约用例能抓住漂移——置信度高（反向演练①直接证成，非推断）
- 适用边界：只覆盖 answers 嵌套键漂移；顶层键漂移由并行窗口的 RESPONSE_SOURCES 静态扫描覆盖
- 被证伪的假设：「用例可能因用例层默认 answers 不含 workspace 而空过」——notCreated 默认对象同样含 workspace: ''（CaptureRequirement.ts:58），取消路径也红

### 下一步

复核卡（t-f054d1）：核对结论与证据一致性

---
