---
requirement_refs: [RF-2, RF-3, RF-5]
---

# 接口设计（REQ-261008020617-088f）

> 本需求是重构（无对外接口变更）。本份记的是**内部契约面**：迁进来的端口与合并后的门。
> 每节标 `serves:`，供覆盖度与孤儿章节判定。

## 端口清单 `serves: RF-3, RF-5`

### `HostFsPort`（`src/application/ports.ts`，实现 `src/adapters/FileHostFs.ts`） `serves: RF-3, RF-5`

七个方法，**全同步**，根**逐次显式**（理由：`docs/architecture/gate-read-root.md` 的两次误拦事故）：

| 方法 | 语义 | 读不到时 |
|---|---|---|
| `cwd()` | 宿主进程 cwd（**不是**任何需求根；capture 的「宿主默认工作区」哨兵源） | — |
| `isDirectory(absPath)` | 绝对路径是否为存在的目录 | `false`（不抛） |
| `existsAbs(absPath)` | 绝对路径是否存在（文件或目录） | `false`（不抛） |
| `exists(root, relPath)` | `<root>/<relPath>` 是否存在 | `false` |
| `readText(root, relPath)` | 读文本 | `undefined`（不抛） |
| `readStateJson(root, name)` | 读 `<root>/.dsh-data/state/<name>` JSON | `undefined`（不抛） |
| `writeStateJsonAtomic(root, name, data)` | 按需建目录 + 临时文件 + rename 原子写（2 空格缩进） | **抛**（降级口径由调用方定） |

### `DiagSinkPort`（`src/application/ports.ts`，实现 `src/adapters/FileDiagSink.ts`） `serves: RF-4`

| 方法 | 语义 | 契约 |
|---|---|---|
| `write(line)` | 追加一行（含换行；时间戳由门面拼） | **实现必须永不抛**；512KB 轮转为 `.1` |

## RTM 门单点 `serves: RF-2`

```typescript
// Before：三份文件各一份，读盘写死在函数体里
function designGateCheck(req: RequirementRecord, workspaceRoot: string): Promise<GateResult>

// After：一份实现 + 三个同名薄壳（导出名、GateResult 形状、消息/code 逐字不变）
async function rtmGateCheck(spec: RtmGateSpec, req: RequirementRecord, docs: DocRepository): Promise<GateResult>
export async function designGateCheck(req: RequirementRecord, docs: DocRepository): Promise<GateResult>
export async function taskCoverageGateCheck(req: RequirementRecord, docs: DocRepository): Promise<GateResult>
export async function acceptanceGateCheck(req: RequirementRecord, docs: DocRepository): Promise<GateResult>
```

`RtmGateSpec` = 三兄弟之间的**全部**差异：`gateName` / `code` / `passMessage` / `gapNoun` /
`gapDetailLead` / `isGap(fr)`。读盘路径 `docs/requirements/<id>/rtm.yaml`；解析失败或结构畸形
→ `rtm_not_found`（**刻意不防御**：`functional_requirements` 缺失必须走进 catch，不得静默判过）。

## 纯函数 `serves: RF-5`

```typescript
/** 与 node:path.isAbsolute **逐平台同口径**（POSIX 下反斜杠开头不是绝对路径）。 */
export function isAbsolutePath(p: string): boolean
```

两个用例的签名各增一个端口形参：

```typescript
resolveWorkspaceAnswer(answer: string, sessionCwd: string, host: HostFsPort): string | undefined
resolveManualWorkspaceRoot(raw: unknown, sessionCwd: string, host: HostFsPort): string
```

## 失败语义与降级口径 `serves: RF-3, RF-5`

- **读**一律不抛（`undefined` / `false`），调用方按「判不了」处理——与搬迁前 `existsSync` + `try/catch` 同口径。
- **写**照实抛：`rtm-yaml` / 留痕调用方各自 try/catch 并静默（增强层纪律：证据丢了是遗憾，把成功的同步改判成失败是错误）。
- **未装配**：`HostFsPort` 是 `UseCaseDeps` 必填字段，漏装配 = 编译报错（不给运行期兜底）。

## 调用方纪律 `serves: RF-2`

RTM 门吃的是 `deps.docs`（宿主级单例）⇒ 调用前必须按 `docs/architecture/gate-read-root.md` 的
唯一收敛入口 `applyRequirementWorkspaceRoot(deps, req)` 校正根；否则完整性门误拦、其余门静默放行。
