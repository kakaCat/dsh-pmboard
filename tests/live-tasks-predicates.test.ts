/**
 * 活卡判据与依赖判定单点（REQ-261005193546-1b1a t1 / FR-1 / FR-4；契源 design/interfaces.md §2/§3.2）。
 *
 * 这份用例的职责不是「跑一遍函数」，而是把**契约里可证伪的那几条**钉住：
 * 1. 判据单点：`isLiveTask` 只对 canceled 为假（七个 TaskStatus 逐一取值，不靠记忆）；
 * 2. 唯一约束桶 = pending：satisfied / dangling 都不阻塞 ready；
 * 3. 「缺席 = 已满足」：指向取消卡的依赖不再卡死活卡（本需求要修的病）；
 * 4. 分母同源：`liveCountOf === liveTasksOf().length`；
 * 5. 层号 = 「把指向取消卡的边删掉后重算」（用例内用**独立实现**的最长路径复算，不调被测函数）；
 * 6. 纯函数：入参数组与元素一律不被改写。
 *
 * 逆验证（人工跑过，见任务汇报）：把 `isLiveTask` 临时改成 `return true`，本文件必红
 * （「七个状态只 canceled 为假」与「活卡集合剔除取消卡」两条断言先红）。
 */
import { describe, it, expect } from 'vitest'
import {
  isLiveTask,
  liveTasksOf,
  liveCountOf,
  isDependencySatisfied,
  splitDependencyEdges,
  isReadyTask,
  layerInputOf,
  liveLayers,
  liveReadyTasks,
} from '../src/domain/status/Predicates.js'
import { TASK_STATUS_ORDER, type TaskStatus } from '../src/domain/task/TaskStatus.js'

/** 用例里的最小任务形状（domain 判据只吃结构，不吃台账类型）。 */
interface Mini {
  id: string
  status: string
  dependsOn?: readonly string[]
}

const task = (id: string, status: string, dependsOn?: readonly string[]): Mini =>
  dependsOn === undefined ? { id, status } : { id, status, dependsOn }

/** 按 id 建索引（用例侧独立实现，不调被测的 liveReadyTasks）。 */
const byIdOf = <T extends { id: string }>(tasks: readonly T[]): Map<string, T> =>
  new Map(tasks.map((t): [string, T] => [t.id, t]))

describe('isLiveTask：活卡判据单点（FR-4）', () => {
  it('遍历 TASK_STATUS_ORDER：仅 canceled 为假，其余六个状态全为真', () => {
    const falsy: TaskStatus[] = []
    for (const status of TASK_STATUS_ORDER) {
      if (!isLiveTask({ status })) falsy.push(status)
    }
    expect(falsy).toEqual(['canceled'])
  })

  it('不依赖 id / 其它字段：只有 { status } 也能判', () => {
    expect(isLiveTask({ status: 'canceled' })).toBe(false)
    expect(isLiveTask({ status: 'todo' })).toBe(true)
  })
})

describe('liveTasksOf / liveCountOf：集合与分母同源', () => {
  const fixture: Mini[] = [
    task('a', 'todo'),
    task('b', 'canceled'),
    task('c', 'done'),
    task('d', 'in_progress'),
    task('e', 'canceled'),
  ]

  it('剔除取消卡，顺序 = 输入顺序，元素按引用返回', () => {
    const live = liveTasksOf(fixture)
    expect(live.map((t) => t.id)).toEqual(['a', 'c', 'd'])
    expect(live[0]).toBe(fixture[0])
    expect(live.every((t) => isLiveTask(t))).toBe(true)
  })

  it('返回新数组（不是入参本身）', () => {
    expect(liveTasksOf(fixture)).not.toBe(fixture)
  })

  it('liveCountOf === liveTasksOf().length（多组输入，含空集）', () => {
    const cases: readonly (readonly Mini[])[] = [
      fixture,
      [],
      [task('x', 'canceled')],
      [task('y', 'todo')],
      [task('p', 'done'), task('q', 'in_review')],
    ]
    for (const tasks of cases) {
      expect(liveCountOf(tasks)).toBe(liveTasksOf(tasks).length)
    }
    expect(liveCountOf(fixture)).toBe(3)
    expect(liveCountOf([])).toBe(0)
  })

  it('不改入参：数组长度与内容逐字不变（入参数组冻结，写入会直接抛错）', () => {
    const frozen = Object.freeze([
      Object.freeze(task('a', 'todo', ['b'])),
      Object.freeze(task('b', 'canceled', ['a'])),
    ]) as readonly Mini[]
    const before = JSON.stringify(frozen)
    expect(liveTasksOf(frozen).map((t) => t.id)).toEqual(['a'])
    expect(liveCountOf(frozen)).toBe(1)
    expect(frozen.length).toBe(2)
    expect(JSON.stringify(frozen)).toBe(before)
  })
})

describe('isDependencySatisfied：四类依赖态（undefined / done / canceled / 未了结）', () => {
  it('undefined（悬空）→ true', () => {
    expect(isDependencySatisfied(undefined)).toBe(true)
  })

  it('done / canceled → true（canceled 视为已了结）', () => {
    expect(isDependencySatisfied({ status: 'done' })).toBe(true)
    expect(isDependencySatisfied({ status: 'canceled' })).toBe(true)
  })

  it('todo / in_progress → false（未了结 = 约束）', () => {
    expect(isDependencySatisfied({ status: 'todo' })).toBe(false)
    expect(isDependencySatisfied({ status: 'in_progress' })).toBe(false)
  })

  it('遍历 TASK_STATUS_ORDER：真值集合恰为 {done, canceled}', () => {
    const truthy = TASK_STATUS_ORDER.filter((status) => isDependencySatisfied({ status }))
    expect(truthy).toEqual(['done', 'canceled'])
  })
})

describe('splitDependencyEdges：三桶分类（唯一约束桶 = pending）', () => {
  it('（悬空 / done / canceled / todo）四类依赖分别落 dangling / satisfied / satisfied / pending', () => {
    const tasks: Mini[] = [
      task('x', 'todo', ['ghost', 'd', 'c', 'y']),
      task('d', 'done'),
      task('c', 'canceled'),
      task('y', 'in_progress'),
    ]
    const byId = byIdOf(tasks)
    const split = splitDependencyEdges(tasks[0]!, byId)
    expect(split).toEqual({
      satisfied: ['d', 'c'],
      pending: ['y'],
      dangling: ['ghost'],
    })
  })

  it('桶恰好三个键（形状定死），且顺序 = dependsOn 原顺序', () => {
    const tasks: Mini[] = [
      task('x', 'todo', ['y', 'ghost', 'c', 'd']),
      task('y', 'todo'),
      task('c', 'canceled'),
      task('d', 'done'),
    ]
    const split = splitDependencyEdges(tasks[0]!, byIdOf(tasks))
    expect(Object.keys(split).sort()).toEqual(['dangling', 'pending', 'satisfied'])
    expect(split.pending).toEqual(['y'])
    expect(split.dangling).toEqual(['ghost'])
    expect(split.satisfied).toEqual(['c', 'd'])
  })

  it('缺省 dependsOn = 空依赖 ⇒ 三桶全空', () => {
    expect(splitDependencyEdges(task('x', 'todo'), new Map())).toEqual({
      satisfied: [],
      pending: [],
      dangling: [],
    })
  })

  it('不改入参：dependsOn 数组本身不被改写（冻结输入）', () => {
    const deps = Object.freeze(['ghost', 'd', 'c', 'y'])
    const tasks: Mini[] = [
      Object.freeze({ id: 'x', status: 'todo', dependsOn: deps }) as Mini,
      task('d', 'done'),
      task('c', 'canceled'),
      task('y', 'todo'),
    ]
    const before = JSON.stringify(tasks)
    splitDependencyEdges(tasks[0]!, byIdOf(tasks))
    expect(deps.length).toBe(4)
    expect(JSON.stringify(tasks)).toBe(before)
  })
})

describe('isReadyTask：真值表（自身 todo 且约束桶为空）', () => {
  const canceledDep: Mini[] = [task('y', 'canceled')]
  const pendingDep: Mini[] = [task('y', 'todo')]

  it('{todo, dependsOn:[y]} + byId(y=canceled) === true（取消卡不再卡死活卡）', () => {
    expect(isReadyTask(task('x', 'todo', ['y']), byIdOf(canceledDep))).toBe(true)
  })

  it('同形但自身 in_progress === false', () => {
    expect(isReadyTask(task('x', 'in_progress', ['y']), byIdOf(canceledDep))).toBe(false)
  })

  it('自身非 todo 一律 false（done / in_review / canceled 各取一例）', () => {
    for (const status of ['done', 'in_review', 'canceled']) {
      expect(isReadyTask(task('x', status, ['y']), byIdOf(canceledDep))).toBe(false)
    }
  })

  it('依赖未了结 → false；依赖 done → true', () => {
    expect(isReadyTask(task('x', 'todo', ['y']), byIdOf(pendingDep))).toBe(false)
    expect(isReadyTask(task('x', 'todo', ['y']), byIdOf([task('y', 'done')]))).toBe(true)
  })

  it('无依赖 / 悬空依赖 → true（悬空按已满足放行，脏引用由 V-3 兜底）', () => {
    expect(isReadyTask(task('x', 'todo'), new Map())).toBe(true)
    expect(isReadyTask(task('x', 'todo', ['ghost']), new Map())).toBe(true)
  })

  it('等价于设计 §3.2 的 every(isDependencySatisfied) 写法（对拍）', () => {
    const cases: readonly Mini[][] = [
      [task('x', 'todo', ['a', 'b']), task('a', 'done'), task('b', 'canceled')],
      [task('x', 'todo', ['a', 'b']), task('a', 'done'), task('b', 'todo')],
      [task('x', 'todo', ['ghost'])],
      [task('x', 'in_progress', ['a']), task('a', 'done')],
      [task('x', 'todo')],
    ]
    for (const tasks of cases) {
      const byId = byIdOf(tasks)
      const x = tasks[0]!
      const expected =
        x.status === 'todo' && (x.dependsOn ?? []).every((d) => isDependencySatisfied(byId.get(d)))
      expect(isReadyTask(x, byId)).toBe(expected)
    }
  })
})

describe('layerInputOf / liveLayers：按活卡分层（写读同源）', () => {
  it('layerInputOf：只留活卡，且只留指向活卡的边；不改入参', () => {
    const tasks: Mini[] = [
      task('x', 'todo', ['y', 'c', 'ghost']),
      task('y', 'todo'),
      task('c', 'canceled', ['y']),
    ]
    const before = JSON.stringify(tasks)
    const input = layerInputOf(tasks)
    expect(input.map((t) => t.id)).toEqual(['x', 'y'])
    expect(input[0]!.dependsOn).toEqual(['y'])
    // 未发生删边的卡按引用返回；入参对象与数组一字未动
    expect(input[1]).toBe(tasks[1])
    expect(tasks[0]!.dependsOn).toEqual(['y', 'c', 'ghost'])
    expect(JSON.stringify(tasks)).toBe(before)
  })

  it('liveLayers：x 的唯一前置 y 已取消 ⇒ get(x) === 0（取消卡不再抬高活卡层号）', () => {
    const tasks: Mini[] = [
      task('x', 'todo', ['y']),
      task('y', 'canceled'),
    ]
    const layers = liveLayers(tasks)
    expect(layers.get('x')).toBe(0)
    expect(layers.has('y')).toBe(false)
    expect(layers.size).toBe(1)
  })

  it('liveLayers 与「把指向取消卡的边删掉后重算」等值（用例侧独立最长路径复算）', () => {
    const tasks: Mini[] = [
      task('a', 'todo'),
      task('b', 'todo', ['a']),
      task('c', 'canceled', ['b']), // 取消卡：不参与分层，也不得抬高 b
      task('d', 'todo', ['b', 'c', 'ghost']), // c 取消 + ghost 悬空 ⇒ d 的真实前置只有 b
      task('e', 'done', ['d']),
      task('f', 'todo', ['d', 'e']), // e 是 done（活卡），仍参与分层
    ]
    const layers = liveLayers(tasks)
    expect([...layers.entries()].sort()).toEqual([
      ['a', 0],
      ['b', 1],
      ['d', 2],
      ['e', 3],
      ['f', 4],
    ])
    expect(layers.has('c')).toBe(false)

    // 独立复算：删掉取消卡节点与其边后，按最长路径手算层号（不调被测实现）
    const live = tasks.filter((t) => isLiveTask(t))
    const liveIds = new Set(live.map((t) => t.id))
    const memo = new Map<string, number>()
    const depthOf = (id: string): number => {
      const hit = memo.get(id)
      if (hit !== undefined) return hit
      const node = live.find((t) => t.id === id)!
      const deps = (node.dependsOn ?? []).filter((d) => liveIds.has(d))
      const value = deps.length === 0 ? 0 : Math.max(...deps.map((d) => depthOf(d))) + 1
      memo.set(id, value)
      return value
    }
    for (const t of live) expect(layers.get(t.id)).toBe(depthOf(t.id))
  })
})

describe('liveReadyTasks：就绪集合单点（byId 建在活卡集合上）', () => {
  it('指向取消卡的依赖 = 缺席 = 已满足 ⇒ 该活卡在 ready 里（顺序 = 输入顺序）', () => {
    const tasks: Mini[] = [
      task('a', 'todo'),
      task('b', 'todo', ['dead']),
      task('dead', 'canceled'),
      task('c', 'todo', ['a']), // 依赖活卡 a（todo）⇒ 不 ready
      task('d', 'in_progress'),
      task('e', 'done'),
    ]
    expect(liveReadyTasks(tasks)).toEqual(['a', 'b'])
  })

  it('依赖已取消卡 + 依赖活卡（todo）⇒ 仍不 ready（取消不放松真约束）', () => {
    const tasks: Mini[] = [
      task('x', 'todo', ['y', 'z']),
      task('y', 'canceled'),
      task('z', 'todo'),
    ]
    // x 带着一条 dead 边也仍需等真约束 z；z 自己无依赖 ⇒ ready
    expect(liveReadyTasks(tasks)).toEqual(['z'])
    expect(liveReadyTasks(tasks)).not.toContain('x')
  })

  it('空输入 / 全取消 ⇒ 空集；取消卡自身永不出现在 ready 里', () => {
    expect(liveReadyTasks([])).toEqual([])
    expect(liveReadyTasks([task('x', 'canceled')])).toEqual([])
    expect(liveReadyTasks([task('x', 'todo'), task('y', 'canceled')])).toEqual(['x'])
  })

  it('不改入参（数组与元素逐字不变）', () => {
    const tasks: Mini[] = [
      task('a', 'todo', ['dead']),
      task('dead', 'canceled', ['a']),
    ]
    const before = JSON.stringify(tasks)
    liveReadyTasks(tasks)
    expect(JSON.stringify(tasks)).toBe(before)
    expect(tasks.length).toBe(2)
  })
})
