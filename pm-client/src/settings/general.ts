/**
 * 通用屏的**纯逻辑**（REQ-261004103330-005f t14 / 设计 `frontend.md` 屏 4）。
 *
 * 这一屏只回答一个问题："**现在跑的是哪份东西**"——版本、构建指纹、台账 schema、
 * 库结构版本、运行时、设置文件在哪。它是排查时的第一站，所以每条都要**标明出处**，
 * 不知道的就说不知道（例如宿主 Node 版本，浏览器端**读不到**，不许猜一个）。
 *
 * @module dsh-pmboard/client/settings/general
 */

export interface GeneralRow {
  readonly label: string
  readonly value: string
  /** 等宽展示（路径、指纹、版本号）。 */
  readonly mono?: boolean
  /** 灰色补充说明（出处 / 为什么是未知）。 */
  readonly note?: string
}

export interface GeneralInput {
  readonly pluginVersion?: string
  readonly pluginBuildStamp?: string
  readonly settingsFilePath?: string
  readonly settingsFileExists: boolean
  /** 台账数据根（来自系统记录的路径档案；拿不到就不写这一行——不编路径）。 */
  readonly dataRoot?: string
  /** 当前生效后端与来源（原型「当前后端」行：`JSON 分片（来源：插件配置）`）。 */
  readonly backend?: { readonly effective: string; readonly sourceLabel: string }
  /** SQLite 库结构版本（来自系统记录；没有就不写数字）。 */
  readonly sqliteSchemaVersion?: number
  /** 台账**记录**形态版本：设计常量，换后端不升版（FR-9）。 */
  readonly ledgerSchemaVersion?: number
}

/**
 * 通用屏的行。
 *
 * 两条"不编"的纪律：
 *   · 宿主 **Node 版本浏览器端读不到**（服务端接口没暴露）→ 如实写"未知 + 以宿主日志为准"；
 *   · 台账 schema 是**设计常量**，标注出处，不假装是从服务端读来的。
 */
export function generalRowsOf(input: GeneralInput): readonly GeneralRow[] {
  const rows: GeneralRow[] = []
  // 顺序照原型：设置文件 → 台账数据根 → 当前后端 → 版本 → 指纹 → schema → 运行时
  if (input.settingsFilePath !== undefined) {
    rows.push({
      label: '设置文件',
      value: input.settingsFilePath,
      mono: true,
      note: input.settingsFileExists
        ? '已创建（保存过一次上限或确认过一次切库）'
        : '尚未创建（当前全部走内置默认；首次保存上限或确认切库时才落盘——惰性，避免把默认值冻进文件）',
    })
  }
  // 这两行**恒定存在**（原型里恒有）：拿不到值就如实写"未知"，而不是把整行省掉——
  // 少一行会让人以为"这一项不存在"，而实际只是"这一项还没拿到"。
  rows.push(input.dataRoot !== undefined
    ? { label: '台账数据根', value: input.dataRoot, mono: true, note: '实际解析到的路径，不是配置里的写法' }
    : { label: '台账数据根', value: '未知（服务端未返回）', note: '系统记录或设置摘要里都没有这一项' })
  rows.push(input.backend !== undefined
    ? { label: '当前后端', value: input.backend.effective + '（来源：' + input.backend.sourceLabel + '）' }
    : { label: '当前后端', value: '未知（服务端未返回）' })
  rows.push({
    label: 'PM 插件版本',
    value: input.pluginVersion !== undefined ? 'dsh-pmboard ' + input.pluginVersion : '未知（服务端未返回）',
    note: '单一来源：产物的 package.json version，运行时读取；同时落盘进系统记录顶层 plugin 块',
  })
  if (input.pluginBuildStamp !== undefined) {
    rows.push({ label: '插件构建指纹', value: 'plugin_build=' + input.pluginBuildStamp, mono: true, note: '同一份产物自证' })
  }
  rows.push({
    label: '台账 schema',
    value: input.ledgerSchemaVersion !== undefined
      ? 'REQBOARD_SCHEMA_VERSION = ' + String(input.ledgerSchemaVersion) + '（不因加 SQLite 而升版）'
      : '未知',
    mono: true,
    note: '换存储后端不改记录形态，故不升版',
  })
  rows.push({
    label: 'SQLite 库结构版本',
    value: input.sqliteSchemaVersion !== undefined ? String(input.sqliteSchemaVersion) : '未创建 / 未知',
    note: '与记录形态版本是两件事：库表结构变了才 +1',
  })
  rows.push({
    label: '运行时',
    value: '未知（客户端读不到宿主运行时）',
    note: '浏览器端拿不到宿主 Node 版本与 node:sqlite 可用性；以宿主日志或系统记录为准',
  })
  return rows
}

/**
 * 「打开配置文件」的可用性与提示（设计 R7）。
 *
 * 惰性创建（FR-17）下"文件不存在"是**正常态**：按钮要禁用并解释，
 * 而不是去打开一个不存在的路径（那会得到"文档不存在"的误导报错）。
 */
export function openConfigCopyOf(input: { readonly path?: string; readonly exists: boolean }): {
  readonly disabled: boolean
  readonly hint: string
} {
  if (input.path === undefined) {
    return { disabled: true, hint: '暂时拿不到设置文件路径（服务端未返回）' }
  }
  if (!input.exists) {
    return { disabled: true, hint: '尚未创建：首次保存后生成（保存一次上限、或确认一次切库后就会出现）' }
  }
  return { disabled: false, hint: '在侧栏打开设置文件' }
}

/**
 * 一致性红字（若系统记录报"版本不一致"，通用屏要给重建库的指引）。
 *
 * 为什么通用屏也要提一次：它是排查第一站——人先来这里看版本，就该在这里看到"别硬读旧表"。
 */
export function rebuildHintOf(consistent: boolean): string | undefined {
  if (consistent) return undefined
  return '版本不一致：请重建库（迁移会先备份旧库再全量重建）——不得硬读旧表。'
}
