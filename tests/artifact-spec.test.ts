/**
 * 产物规约单测（REQ-261005105032-3b02 t1 / FR-1, FR-2）——原型成为一等产物的分类契约。
 *
 * 锁三件事（都是"改坏了必须红"的判据，不是走一遍代码）：
 *   1. 路径 → kind：`prototypes/*.html`、`prototype/*.html`（旧路径兼容）、`prototypes/INDEX.md`
 *      三条都判 `prototype`，**不得回落 notes**（回落 = 原型交没交失去可数抓手，决议 #1）；
 *      同时既有 7 条规则逐条不漂移（分类规则升级最容易踩的就是插队与顺序改动）。
 *   2. `ALL_ARTIFACT_KINDS` 与 `ArtifactKind` 联合同步：漏加项会让 reqboard_submit /
 *      看板确认 / 弹框确认三处白名单（`asArtifactKind` 等一律读它）静默拒收新 kind。
 *   3. `stageForKind('prototype')` 是**显式** case → `brainstorming`（决议 #3）：
 *      若走 default，同一条需求在不同阶段扫描会得到两种归属，阶段读数会飘。
 *
 * 依据：design/data-model.md §1.1/§1.2/§1.6、notes/design-brief.md §1 与 §10 决议 #1/#3/#33。
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_ARTIFACT_KINDS,
  kindForRelPath,
  type ArtifactKind,
} from '../src/domain/artifact/ArtifactSpec.js'
import { stageForKind } from '../src/application/internal/artifact-discovery.js'

/** 联合同步判据：全部取值逐项列出（新增 kind 忘了改这里 → 本用例红）。 */
const EXPECTED_KINDS: readonly ArtifactKind[] = [
  'requirement', 'plan', 'decomposition', 'design', 'task_detail',
  'verification', 'archive', 'notes', 'task_output', 'prototype',
]

describe('TC-P1 · 原型路径 → kind=prototype（三条规则）', () => {
  it('权威路径 prototypes/<name>.html → prototype', () => {
    expect(kindForRelPath('prototypes/detail.html')).toBe('prototype')
    expect(kindForRelPath('prototypes/detail-v2.html')).toBe('prototype')
  })
  it('旧路径 prototype/<name>.html → prototype（REQ-292a 形态，仍识别 + 提示迁移）', () => {
    expect(kindForRelPath('prototype/detail.html')).toBe('prototype')
  })
  it('权威清单 prototypes/INDEX.md → prototype（决议 #1：不落 notes）', () => {
    expect(kindForRelPath('prototypes/INDEX.md')).toBe('prototype')
  })
  it('不误命中：.html.bak / 非 html 后缀 / 大写后缀仍按未命中回落 notes', () => {
    // `.bak` 不满足 `\.html$`——这条是"不许把备份文件当原型登记"的护栏
    expect(kindForRelPath('prototypes/detail.html.bak')).toBe('notes')
    expect(kindForRelPath('prototypes/detail.htm')).toBe('notes')
    // 正则逐字是小写 `.html`（design/data-model.md §1.2），大写形态属未命中
    expect(kindForRelPath('prototypes/detail.HTML')).toBe('notes')
  })
  it('子目录里的原型同样命中（`prototypes/.+\\.html` 覆盖多级）', () => {
    expect(kindForRelPath('prototypes/screens/detail.html')).toBe('prototype')
  })
})

describe('TC-P2 · 既有 7 条分类规则不漂移（新规则只许追加）', () => {
  it('既有规则逐条判定不变', () => {
    expect(kindForRelPath('requirement.md')).toBe('requirement')
    expect(kindForRelPath('plan.md')).toBe('plan')
    expect(kindForRelPath('decomposition.md')).toBe('decomposition')
    expect(kindForRelPath('design/frontend.md')).toBe('design')
    expect(kindForRelPath('verification.md')).toBe('verification')
    expect(kindForRelPath('archive.md')).toBe('archive')
    expect(kindForRelPath('tasks/t-4d8a57.md')).toBe('task_detail')
  })
  it('未命中仍回落 notes（原型规则的加项不得改变兜底语义）', () => {
    expect(kindForRelPath('notes/anything.txt')).toBe('notes')
    expect(kindForRelPath('prototypes')).toBe('notes')
  })
})

describe('TC-P3 · ALL_ARTIFACT_KINDS 与 ArtifactKind 联合同步', () => {
  it('逐项相等（顺序无关）且含 prototype', () => {
    expect([...ALL_ARTIFACT_KINDS].sort()).toEqual([...EXPECTED_KINDS].sort())
    expect(ALL_ARTIFACT_KINDS).toContain('prototype')
  })
  it('无重复项（重复会让白名单与计数口径同时对不上）', () => {
    expect(new Set(ALL_ARTIFACT_KINDS).size).toBe(ALL_ARTIFACT_KINDS.length)
  })
})

describe('TC-P4 · stageForKind：prototype 显式归 brainstorming（决议 #3）', () => {
  it("prototype → 'brainstorming'（与发现时的当前阶段无关）", () => {
    expect(stageForKind('prototype', 'accepting')).toBe('brainstorming')
    expect(stageForKind('prototype', 'draft')).toBe('brainstorming')
  })
  it('既有 kind 的阶段归属不变；notes 仍归当前阶段（default 语义未被误用）', () => {
    expect(stageForKind('requirement', 'accepting')).toBe('brainstorming')
    expect(stageForKind('design', 'accepting')).toBe('design')
    expect(stageForKind('notes', 'implementing')).toBe('implementing')
  })
})
