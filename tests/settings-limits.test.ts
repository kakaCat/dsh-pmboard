/**
 * 运行上限屏的单测（REQ-261004103330-005f t12）。
 *
 * ## 这份测试锁的是什么
 *
 * 1. **九行、中文名取自唯一事实源**（不是我们另造的第二份中文名）；
 * 2. **草稿态**：改值 → 脏标记 + 保存条 + 只提交脏项；
 * 3. **非法值三态当场拦**（非整数 / 0 / 10001）→ 标红 + 保存键禁用，**非法项不进补丁**；
 * 4. **保存链路**：成功 → 重取（徽章按服务端真实来源刷新）；失败 → 服务端原话照实显示；
 * 5. **未自动化阶段**仍列出但弱化（留着整表对账）；
 * 6. 样式与类名纪律：只用 `dsh-pm-set-` 前缀、只用真令牌（不出现原型里的 `--s-*`）。
 */
import { describe, it, expect } from 'vitest'
import {
  COPY, LIMIT_MAX, LIMIT_MIN, SETTINGS_STAGES, dirtyPatch, dirtyStages,
  invalidStages, isAutomatedStage, limitInvalidReason, sourceBadge, stageLabel,
} from '../src/client/settings/limits.ts'
import { buildLimitsPane } from '../src/client/settings/render/limits.ts'
import { initialShellState, reduceShell, type SettingsShellState } from '../src/client/settings/model.ts'
import { buildSettingsShell } from '../src/client/settings/render/shell.ts'
import { SETTINGS_CSS } from '../src/client/styles/settings.ts'
import { WORKFLOW_STAGES } from '../src/client/workflow-constants.ts'
import type { StageKey, StageLimitView } from '../src/client/settings/types.ts'

const limits = (v: Partial<Record<StageKey, Partial<StageLimitView>>>): Readonly<Partial<Record<StageKey, StageLimitView>>> => {
  const out: Partial<Record<StageKey, StageLimitView>> = {}
  for (const [k, val] of Object.entries(v)) {
    out[k as StageKey] = { value: val?.value ?? 0, default: val?.default ?? 0, source: val?.source ?? 'default' }
  }
  return out
}

const seeded = (): Readonly<Partial<Record<StageKey, StageLimitView>>> => limits({
  draft: { value: 1, default: 1, source: 'default' },
  brainstorming: { value: 300, default: 500, source: 'settings' },
  design: { value: 200, default: 200, source: 'default' },
  decomposing: { value: 100, default: 100, source: 'default' },
  implementing: { value: 800, default: 1000, source: 'config' },
  accepting: { value: 50, default: 50, source: 'env' },
  done: { value: 1, default: 1, source: 'default' },
  archived: { value: 1, default: 1, source: 'default' },
  canceled: { value: 1, default: 1, source: 'default' },
})

describe('阶段名与自动化口径', () => {
  it('九行阶段，中文名取自流程节点表（不是另造一份）', () => {
    expect(SETTINGS_STAGES).toHaveLength(9)
    for (const stage of ['draft', 'brainstorming', 'design', 'decomposing', 'implementing', 'accepting', 'archived'] as StageKey[]) {
      expect(stageLabel(stage)).toBe((WORKFLOW_STAGES as Record<string, { label: string }>)[stage].label)
    }
  })

  it('canceled 不在流程节点表里，复用的是已取消这个既有标签，不是自造', () => {
    expect(stageLabel('canceled')).toBe('已取消')
  })

  it('只有五个阶段会自动续跑；其余列出但标为不自动跑', () => {
    expect(SETTINGS_STAGES.filter(isAutomatedStage)).toEqual([
      'brainstorming', 'design', 'decomposing', 'implementing', 'accepting',
    ])
  })
})

describe('非法值三态（当场拦，不进补丁）', () => {
  it('非整数 / 0 / 超上限 分别给出不同原因', () => {
    expect(limitInvalidReason('1.5')).toContain('整数')
    expect(limitInvalidReason('abc')).toContain('整数')
    expect(limitInvalidReason('')).toContain('需填')
    expect(limitInvalidReason('0')).toBe('不得小于 ' + String(LIMIT_MIN))
    expect(limitInvalidReason(String(LIMIT_MAX + 1))).toBe('不得大于 ' + String(LIMIT_MAX))
  })

  it('边界值合法（1 与 10000）', () => {
    expect(limitInvalidReason('1')).toBeUndefined()
    expect(limitInvalidReason('10000')).toBeUndefined()
  })

  it('非法项既不进"脏项"也不进补丁', () => {
    const drafts = { implementing: '0' as string, design: '250' }
    expect(invalidStages(drafts).map((x) => x.stage)).toEqual(['implementing'])
    expect(dirtyStages(seeded(), drafts)).toEqual(['design'])
    expect(dirtyPatch(seeded(), drafts)).toEqual({ design: 250 })
  })

  it('值没变不算脏（写回原值不该出现保存条）', () => {
    expect(dirtyStages(seeded(), { implementing: '800' })).toEqual([])
  })
})

describe('渲染：九行 + 徽章 + 保存条', () => {
  const html = () => buildLimitsPane({ limits: seeded(), drafts: {}, saving: false })

  it('九行都在，未自动化阶段弱化但仍可见', () => {
    const out = html()
    for (const stage of SETTINGS_STAGES) {
      expect(out).toContain('data-stage="' + stage + '"')
    }
    expect(out).toContain('is-manual')
    expect(out).toContain('不自动跑')
  })

  it('来源徽章按真实来源显示（设置文件/插件配置/环境变量/内置默认）', () => {
    const out = html()
    expect(out).toContain('设置文件')
    expect(out).toContain('插件配置')
    expect(out).toContain('环境变量')
    expect(out).toContain('内置默认')
  })

  it('无改动时不渲染保存条；有改动时出现且只数脏项', () => {
    expect(html()).not.toContain('dsh-pm-set-savebar')
    const dirty = buildLimitsPane({ limits: seeded(), drafts: { design: '250' }, saving: false })
    expect(dirty).toContain('dsh-pm-set-savebar')
    // 数字按界面基准加粗（原型原文是「有 <b>N</b> 项改动未保存」），故断言按标记匹配
    expect(dirty).toMatch(/有\s*<b>1<\/b>\s*项改动未保存/)
  })

  it('非法草稿：输入框标红 + 行内原因 + 保存键禁用 + 文案改为不合法', () => {
    const bad = buildLimitsPane({ limits: seeded(), drafts: { implementing: '0' }, saving: false })
    expect(bad).toContain('is-invalid')
    expect(bad).toContain('不得小于 1')
    expect(bad).toContain('aria-invalid="true"')
    expect(bad).toContain('项不合法，保存会被拒绝')
    expect(bad).toMatch(/data-action="settings-limit-save" disabled/)
  })

  it('必须出现的两句文案都在（范围与改小语义）', () => {
    const out = html()
    expect(out).toContain(COPY.range)
    expect(out).toContain(COPY.shrink)
  })

  it('保存失败的消息照实呈现（不吞错）', () => {
    const failed = buildLimitsPane({ limits: seeded(), drafts: {}, saving: false, error: '保存失败：500 出错了' })
    expect(failed).toContain('保存失败：500 出错了')
  })
})

describe('壳接线：limits 屏真的渲染本屏内容（不再是占位）', () => {
  it('打开设置且停在 limits 时，渲染的是上限表而不是占位句', () => {
    let s: SettingsShellState = initialShellState()
    s = reduceShell(s, { kind: 'open', pane: 'limits' })
    s = reduceShell(s, { kind: 'load-ok', settingsFileExists: true, limits: seeded() })
    const html = buildSettingsShell(s)
    expect(html).toContain('dsh-pm-set-table')
    // 只看 limits 那一段：壳会同时渲染四个屏位（隐藏的也在 DOM 里），
    // 所以"整份 HTML 不含占位句"是错的断言——要按屏切片来看。
    // 边界用**屏位 id**，不要用 `data-pane=...`——后者先出现在左菜单按钮上，切片会落空
    const limitsPane = html.slice(
      html.indexOf('id="dsh-pm-set-pane-limits"'),
      html.indexOf('id="dsh-pm-set-pane-storage"'),
    )
    expect(limitsPane).toContain('dsh-pm-set-table')
    expect(limitsPane).not.toContain('的内容将在后续任务卡中落地')
  })

  // t13/t14 落地后，这条从"其它三屏仍是占位"升级为**终态断言**：
  // 四屏都渲染自己的内容，整份壳里**不再出现任何占位句**（比改前更强）。
  it('四屏均已落地：整份壳里没有任何占位句，且各屏渲染自己的内容', () => {
    let s: SettingsShellState = initialShellState()
    s = reduceShell(s, { kind: 'open', pane: 'records' })
    s = reduceShell(s, { kind: 'load-ok', settingsFileExists: true, limits: seeded() })
    // 记录屏要有数据才谈得上"渲染自己的内容"：补一条最简记录（含一条时间线事件）
    s = reduceShell(s, {
      kind: 'record-ok',
      record: {
        ok: true, updatedAt: '2026-10-04T10:31:12+08:00',
        plugin: { name: 'dsh-pmboard', version: '0.1.0', buildStamp: 'x', sqliteSchemaVersion: 1, recordedAt: 'x' },
        paths: {}, active: { backend: 'json', since: 'x', source: 'settings' }, stores: {},
        history: [{ at: '2026-10-04T10:31:12+08:00', event: 'startup', backend: 'json', source: 'config', requirements: 1 }],
        counters: {}, compat: { consistent: true, currentPluginVersion: '0.1.0', upgrades: [] },
      } as never,
    })
    const html = buildSettingsShell(s)
    expect(html).not.toContain('的内容将在后续任务卡中落地')
    expect(html).toContain('后端使用史')
    expect(html).toContain('启动')
  })
})

describe('状态机：草稿与保存', () => {
  it('set-draft 记账、reset-draft 只清一项、clear-drafts 全清', () => {
    let s = initialShellState()
    s = reduceShell(s, { kind: 'set-draft', stage: 'design', raw: '250' })
    s = reduceShell(s, { kind: 'set-draft', stage: 'accepting', raw: '20' })
    expect(s.drafts).toEqual({ design: '250', accepting: '20' })
    s = reduceShell(s, { kind: 'reset-draft', stage: 'design' })
    expect(s.drafts).toEqual({ accepting: '20' })
    s = reduceShell(s, { kind: 'clear-drafts' })
    expect(s.drafts).toEqual({})
  })

  it('重取（load-ok）清空草稿并带来源徽章数据', () => {
    let s = reduceShell(initialShellState(), { kind: 'set-draft', stage: 'design', raw: '999' })
    s = reduceShell(s, { kind: 'load-ok', settingsFileExists: true, limits: seeded(), clearDrafts: true })
    expect(s.drafts).toEqual({})
    expect(s.limits?.design?.source).toBe('default')
  })

  it('保存中与保存失败各留痕，且保存失败不丢草稿（人不必重填）', () => {
    let s = reduceShell(initialShellState(), { kind: 'set-draft', stage: 'design', raw: '250' })
    s = reduceShell(s, { kind: 'save-start' })
    expect(s.saving).toBe(true)
    s = reduceShell(s, { kind: 'save-fail', message: '保存失败：X' })
    expect(s.saving).toBe(false)
    expect(s.saveError).toBe('保存失败：X')
    expect(s.drafts).toEqual({ design: '250' })
  })
})

describe('样式纪律（设计 R4）', () => {
  it('不许出现原型里的私有令牌 --s-*', () => {
    expect(SETTINGS_CSS.includes('--s-')).toBe(false)
  })

  it('本屏用的类名全部 dsh-pm-set- 前缀', () => {
    for (const cls of ['dsh-pm-set-table', 'dsh-pm-set-savebar', 'dsh-pm-set-limit-input']) {
      expect(SETTINGS_CSS).toContain('.' + cls)
    }
    const bare = SETTINGS_CSS.split('\n').filter((l) => /^\.[a-z]/.test(l) && !l.startsWith('.dsh-pm-set-'))
    expect(bare).toEqual([])
  })

  it('来源徽章四态各有类名（与 sourceBadge 同源）', () => {
    expect(sourceBadge('settings').cls).toBe('is-settings')
    expect(sourceBadge('config').cls).toBe('is-config')
    expect(sourceBadge('env').cls).toBe('is-env')
    expect(sourceBadge('default').cls).toBe('is-default')
  })
})
