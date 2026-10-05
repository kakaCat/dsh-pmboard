# REQ-261002153446-c600 数据模型与契约 `serves: FR-1, FR-2, FR-4`

> 本需求**不触碰台账**（ledger）、不改任何持久化结构；「数据」层面的变化只有客户端两个类型。

## 类型变更 `serves: FR-1, FR-2`

`src/client/session-jump.ts`：

```typescript
// 改：结果枚举新增一个值（其余取值语义不变）
export type SessionJumpResult =
  | 'opened'          // 既含「本来就没归档」，也含「取消归档成功后打开」
  | 'archived'        // 已归档 + 客户端不具备取消归档能力（旧语义保留）
  | 'restore-failed'  // 新增：取消归档动作抛错，未打开
  | 'missing'         // 会话不在列表（可能已删除）
  | 'unavailable'     // 导航/layout 服务未注入

// 改：工作区服务投影增加一个可选方法
export interface WorkspacesServiceFace {
  list: { getSnapshot(): { archivedSessionIds: readonly string[] } }
  /** 新增（可选）：取消归档。旧版本/未注入 → undefined，走 'archived' 旧语义。 */
  unarchiveSession?(sessionId: string): Promise<void>
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 约束 | 说明 |
|---|---|---|---|---|
| `unarchiveSession` | `(sessionId: string) => Promise<void>` | 否（可选） | 幂等；对未归档 id 调用是空操作 | 由 DSH 客户端 `workspaces` 服务提供，本插件不实现 |
| `SessionJumpResult` 新值 | 字面量 `'restore-failed'` | — | 只在「归档 + 恢复抛错」路径产出 | 调用方必须显式处理（`default` 分支已有兜底文案） |

## 宿主侧数据（只读） `serves: FR-1`

- 归档集合由 DSH 宿主 `workspaceRegistry.archivedSessionIds` 持有，经 `workspaces.list.getSnapshot()` 投射给客户端；
  `unarchiveSession` 成功后宿主推送新集合，客户端模型 `installArchived()` 更新 → 看板下次重绘时 chip 自动脱离灰态。
- **归档从不动工作区账目**：会话恢复后回到它原来的侧栏位置（宿主不变式，本插件不参与）。

## 兼容性与迁移 `serves: FR-2, FR-4`

| 变更项 | 旧版本行为 | 新版本行为 | 迁移方案 |
|---|---|---|---|
| `unarchiveSession` 缺失 | 点击归档 chip → 提示无法跳转 | 同左（`archived`） | 无需迁移；能力出现后自动升级行为 |
| `SessionJumpResult` 新增值 | 无 | `restore-failed` | 所有 switch 都补分支；`default` 仍是兜底文案，不会静默 |
| 台账 / RTM / 归档材料 | 不受影响 | 不受影响 | 无 |

**无数据回填、无 schema 迁移、无灰度开关**：本次改动全部发生在浏览器端的行为与文案，
回滚 = 还原源码后重新构建客户端 bundle。
