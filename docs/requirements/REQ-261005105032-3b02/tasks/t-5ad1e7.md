# t-5ad1e7 实现 reqboard_submit(kind=prototype) 登记编排与豁免留痕

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
实现 reqboard_submit(kind=prototype) 登记编排与豁免留痕

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/submit-prototype.test.ts tests/submit-prototype-exempt.test.ts 全绿：合法标本 reqboard_submit(kind='prototype') → success=true、registered_count=1、返回项 anchors 含 'FR-4'、geometry 观测量名含 'tabsTop'；重复调用 → registered_count=0 且台账不重复入簿、INDEX 内容逐字节未改；目录不存在 → success=false、registered_count=0、blockers 含 prototype_missing（不谎报成功）；豁免三态：空理由 → 仍拒；理由非空但 requirement 未落章 → 仍拒（agent 不能自豁免）；已落章 → 放行且写入一条 [豁免] <理由> 需求评论。pnpm typecheck 退出码 0。

## 实施方案（implementation）
改 src/application/use-cases/SubmitArtifact.ts：增 kind='prototype' 分支——① assertArtifactOpenable 按需求目录相对口径归一路径（伪路径/越界即拒）；② kindForRelPath 必须判为 prototype，旧 prototype/*.html 仍识别并在消息里提示迁移到 prototypes/；③ parsePrototypeMetadata 抽锚点与几何量（geometry JSON 坏按缺块记录，不抛；登记不阻断）；④ registerArtifact 幂等（stage+kind+path 去重）并写 StageArtifact.prototypeMeta；⑤ triggerAutoConfirm 请人确认（门禁只要求已登记，确认章为可选加强）；⑥ syncRTMYaml('submit:prototype', {paths}) 失败只 warning。改 src/tools/SubmitTool/SubmitTool.ts：kind 入参含 'prototype'（SUBMIT_KINDS 已含）与可选 path（缺省扫 docs/requirements/<REQ>/prototypes/*.html），返回体增 registered_count 与逐份 prototypes[]（name/path/on_disk/registered/confirmed/exempted/authoritative/superseded_by/serves/anchors/geometry）与 blockers，失败不谎报成功。豁免生效时按 prototypeExemptOf 写一条需求评论 [豁免] <理由>（与 design_exempt 同款），且登记只校验不改写 INDEX。依据 design-brief §1 与 §10 #7/#9/#13/#41。

## 上游产出摘要（dependsSummary）
- 加唯一 async 门禁入口 contentGatesForMove 并接线四条转移路径
- 加 RTM 触发点 submit:prototype 与健康检查适用性判据

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
