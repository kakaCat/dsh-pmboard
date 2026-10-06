/**
 * 工具登记面（REQ-261006123819-3af3 FR-1）——**唯一手写清单**。
 *
 * 为什么需要它：此前同一份工具清单被手写在三个测试里，三个不同的数
 * （目录清单 18 / 注册名 26 / 响应源映射 21），漏登记不会报错，只会让门禁"看着绿"。
 * 现在三处都从本表派生，机器事实（磁盘目录 / 宿主注册名 / 工厂导出）当交叉校验：
 *  - `TOOL_REGISTRY.map(e => e.dir)`       == `readdirSync('src/tools')` 目录集合（I-1）
 *  - `TOOL_REGISTRY.map(e => e.toolName)`  == `apply()` 后 `ctx.tools[].name` 集合（I-2）
 *  - 工厂正则扫到的 key 集合 ⊆ `TOOL_REGISTRY.map(e => e.key)`（I-3）
 *
 * 加一个新工具：在 `src/tools/` 下建目录后，**在本表补一条**即可；
 * 漏补会被上述三条不变量中的至少一条点名（不再靠人记"要登记几处"）。
 *
 * @module dsh-pmboard/tools/registry
 */

/** 一条工具登记。字段语义见 `docs/requirements/REQ-261006123819-3af3/design/interfaces.md`。 */
export interface ToolRegistryEntry {
  /** 工厂名后缀：`define<key>Tool`（output-contract 的扫描键）。 */
  key: string
  /** 工厂所在文件（`src` 相对路径）。 */
  factoryFile: string
  /** 工具目录名（`src/tools/<dir>`；tools-dispatch 目录清单派生源）。 */
  dir: string
  /** 宿主注册的工具名（apply-wiring 名单派生源）。 */
  toolName: string
  /**
   * 响应字面量所在文件（`src` 相对路径，可多个；含 catch 内联返回）。
   * 默认**不含 `factoryFile` 自身**——该文件已被独立扫描。唯一例外是 `SkillInstall`：
   * 它的 `catch` 内联返回就在工厂文件里，登记表把它显式列出来自述这一点（重复扫描无害）。
   */
  responseSources: readonly string[]
}

/** 27 条 = 磁盘上 27 个工具目录，一一对应（I-1）。 */
export const TOOL_REGISTRY: readonly ToolRegistryEntry[] = [
  {
    key: 'Create',
    factoryFile: 'tools/CreateTool/CreateTool.ts',
    dir: 'CreateTool',
    toolName: 'reqboard_create',
    responseSources: ['application/use-cases/CreateRequirement.ts'],
  },
  {
    key: 'Capture',
    factoryFile: 'tools/CaptureTool/CaptureTool.ts',
    dir: 'CaptureTool',
    toolName: 'reqboard_capture',
    responseSources: ['application/use-cases/CaptureRequirement.ts'],
  },
  {
    key: 'Status',
    factoryFile: 'tools/StatusTool/StatusTool.ts',
    dir: 'StatusTool',
    toolName: 'reqboard_status',
    responseSources: ['application/query/QueryState.ts'],
  },
  {
    key: 'TaskReport',
    factoryFile: 'tools/TaskReportTool/TaskReportTool.ts',
    dir: 'TaskReportTool',
    toolName: 'reqboard_task_report',
    responseSources: ['application/use-cases/ReportTask.ts'],
  },
  {
    key: 'Decompose',
    factoryFile: 'tools/DecomposeTool/DecomposeTool.ts',
    dir: 'DecomposeTool',
    toolName: 'reqboard_decompose',
    responseSources: ['application/use-cases/Decompose.ts'],
  },
  {
    key: 'Submit',
    factoryFile: 'tools/SubmitTool/SubmitTool.ts',
    dir: 'SubmitTool',
    toolName: 'reqboard_submit',
    // kind → 用例表驱动分派，四类响应字面量各在一个用例里。
    responseSources: [
      'application/use-cases/SubmitArtifact.ts',
      'application/use-cases/SubmitVerification.ts',
      'application/use-cases/SubmitArchive.ts',
      'application/use-cases/SubmitDesignArtifacts.ts',
    ],
  },
  {
    key: 'AskConfirm',
    factoryFile: 'tools/AskConfirmTool/AskConfirmTool.ts',
    dir: 'AskConfirmTool',
    toolName: 'reqboard_ask_confirm',
    // evidence 路径与弹框路径自动分派。
    responseSources: ['application/use-cases/AskConfirm.ts', 'application/use-cases/ConfirmArtifact.ts'],
  },
  {
    key: 'ConfirmReceipt',
    factoryFile: 'tools/ConfirmReceiptTool/ConfirmReceiptTool.ts',
    dir: 'ConfirmReceiptTool',
    toolName: 'reqboard_confirm_receipt',
    responseSources: ['application/use-cases/ConfirmReceipt.ts'],
  },
  {
    key: 'AcceptSheet',
    factoryFile: 'tools/AcceptSheetTool/AcceptSheetTool.ts',
    dir: 'AcceptSheetTool',
    toolName: 'reqboard_accept_sheet',
    responseSources: ['application/use-cases/AcceptSheet.ts'],
  },
  {
    key: 'TaskExecute',
    factoryFile: 'tools/TaskExecuteTool/TaskExecuteTool.ts',
    dir: 'TaskExecuteTool',
    toolName: 'reqboard_task_execute',
    // task_execute 真委托同一 factory（defineAdvanceTool），响应体与声明都在 AdvanceTool。
    responseSources: ['tools/AdvanceTool/AdvanceTool.ts'],
  },
  {
    key: 'Advance',
    factoryFile: 'tools/AdvanceTool/AdvanceTool.ts',
    dir: 'AdvanceTool',
    toolName: 'reqboard_task_run',
    // 响应字面量就在 factoryFile 内（由独立扫描覆盖）。
    responseSources: [],
  },
  {
    key: 'RunStatus',
    factoryFile: 'tools/RunStatusTool/RunStatusTool.ts',
    dir: 'RunStatusTool',
    toolName: 'reqboard_run_status',
    responseSources: [],
  },
  {
    key: 'TaskStatus',
    factoryFile: 'tools/TaskStatusTool/TaskStatusTool.ts',
    dir: 'TaskStatusTool',
    toolName: 'reqboard_task_status',
    responseSources: [],
  },
  {
    key: 'NoteInterruption',
    factoryFile: 'tools/NoteInterruptionTool/NoteInterruptionTool.ts',
    dir: 'NoteInterruptionTool',
    toolName: 'reqboard_note_interruption',
    responseSources: ['application/use-cases/NoteInterruption.ts'],
  },
  {
    key: 'ClearPause',
    factoryFile: 'tools/ClearPauseTool/ClearPauseTool.ts',
    dir: 'ClearPauseTool',
    toolName: 'reqboard_clear_pause',
    responseSources: ['application/use-cases/ClearPause.ts'],
  },
  {
    key: 'Move',
    factoryFile: 'tools/MoveTool/MoveTool.ts',
    dir: 'MoveTool',
    toolName: 'reqboard_move',
    responseSources: ['application/use-cases/MoveRequirement.ts'],
  },
  {
    key: 'TaskMove',
    factoryFile: 'tools/TaskMoveTool/TaskMoveTool.ts',
    dir: 'TaskMoveTool',
    toolName: 'reqboard_task_move',
    responseSources: ['application/use-cases/MoveTask.ts'],
  },
  {
    key: 'TaskTree',
    factoryFile: 'tools/TaskTreeTool/TaskTreeTool.ts',
    dir: 'TaskTreeTool',
    toolName: 'reqboard_task_tree',
    responseSources: ['application/use-cases/TaskTree.ts'],
  },
  {
    // REQ-261006123819-3af3 FR-1：此前缺映射（门禁根本没看这个工具）。
    key: 'TaskAdopt',
    factoryFile: 'tools/AdoptTaskTool/TaskAdoptTool.ts',
    dir: 'AdoptTaskTool',
    toolName: 'reqboard_task_adopt',
    responseSources: ['application/use-cases/AdoptTask.ts'],
  },
  {
    // FR-1：此前缺映射。
    key: 'Regenerate',
    factoryFile: 'tools/RegenerateTool/index.ts',
    dir: 'RegenerateTool',
    toolName: 'reqboard_task_regenerate',
    responseSources: ['application/use-cases/RegenerateChain.ts'],
  },
  {
    key: 'TaskRefs',
    factoryFile: 'tools/TaskRefsTool/TaskRefsTool.ts',
    dir: 'TaskRefsTool',
    toolName: 'reqboard_task_refs',
    responseSources: ['application/use-cases/AmendTaskRefs.ts'],
  },
  {
    key: 'ArchiveAmend',
    factoryFile: 'tools/ArchiveAmendTool/ArchiveAmendTool.ts',
    dir: 'ArchiveAmendTool',
    toolName: 'reqboard_archive_amend',
    responseSources: ['application/use-cases/AmendArchiveManifest.ts'],
  },
  {
    // FR-1：此前缺映射。
    key: 'Knowledge',
    factoryFile: 'tools/KnowledgeTool/KnowledgeTool.ts',
    dir: 'KnowledgeTool',
    toolName: 'reqboard_kb',
    responseSources: ['application/use-cases/QueryKnowledge.ts'],
  },
  {
    key: 'OpenWindow',
    factoryFile: 'tools/OpenWindowTool/OpenWindowTool.ts',
    dir: 'OpenWindowTool',
    toolName: 'reqboard_open_window',
    responseSources: ['application/use-cases/OpenWindow.ts'],
  },
  {
    key: 'Bind',
    factoryFile: 'tools/BindTool/BindTool.ts',
    dir: 'BindTool',
    toolName: 'reqboard_bind',
    responseSources: ['application/use-cases/BindSeat.ts'],
  },
  {
    key: 'Handoff',
    factoryFile: 'tools/HandoffTool/HandoffTool.ts',
    dir: 'HandoffTool',
    toolName: 'reqboard_handoff',
    responseSources: ['application/use-cases/HandoffOwner.ts'],
  },
  {
    // FR-1：此前缺映射（含 execute 的 catch 内联返回，两个源都要扫）。
    key: 'SkillInstall',
    factoryFile: 'tools/SkillInstallTool/SkillInstallTool.ts',
    dir: 'SkillInstallTool',
    toolName: 'reqboard_skill_install',
    responseSources: [
      'application/use-cases/InstallSkills.ts',
      'tools/SkillInstallTool/SkillInstallTool.ts',
    ],
  },
]
