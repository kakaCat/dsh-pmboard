# 事故留证（第二起）· 2026-09-30 19:01–19:40 · `docs/` 树被整体替换

> **TL;DR**：宿主重启后工具仍不可用 → 查到真因是**插件装载层 `cordis.patch.yml` 被删**（已重建并复验，
> 工具已恢复）。恢复工具后立刻发现更严重的一起：`docs/requirements/` **被整体替换**——
> `REQ-260930094139-2d65` 的整个需求目录**消失**，本需求的 `requirement.md` + `design/` 五份也**消失**
> （只剩 `decomposition.md` 与 `tests/`）。两起事故同一根因：**多个会话共用同一工作树 + 未跟踪文件被覆写/清理**。

## 1. 第一起：插件装载层缺失（已修复）

| 项 | 内容 |
|---|---|
| 现象 | 18:57 起本窗口 `reqboard_*` 工具全失（`unknown tool`）；19:19 重启宿主仍无效 |
| 真因 | `18:54:52` 一批覆写式同步删掉了**未被 git 跟踪**的 `cordis.patch.yml`，而同一批写入了 `package.json` 的 `dsh.bundle.patch: ./cordis.patch.yml` |
| 机制 | DSH `packages/boot/app-boot/src/profile.ts`：bundle 的 patch 文件读不到 → `catch → skippedBundles`，**整个 bundle 被静默跳过**（工具、看板路由、提示词注入全不注册） |
| 铁证 | 用 DSH 本地加载器复现：`skipped: [{packageName:"dsh-pmboard", reason:"failed to read overlay …cordis.patch.yml: ENOENT"}]` |
| 修复 | 按同 profile 内可正常加载的 `dsh-notice-webhook` 的同一约定重建该文件（`insert: id=pmboard, name=dsh-pmboard`） |
| 复验 | 加载器：`layers: dsh-pmboard, dsh-notice-webhook`、`skipped` 无 pmboard、组合后 `{"id":"pmboard","name":"dsh-pmboard"}`；行准入（peer `@deepseek-ai/cordis ^4.0.2` vs 运行时 `0.2.0-rc.1`）通过 |
| 结果 | 重启后工具与提示词注入恢复 ✅ |

## 2. 第二起：`docs/` 树被整体替换（部分不可恢复）

| 时刻 | 事件 | 证据 |
|---|---|---|
| ~19:01 | 本需求目录开始丢文件 | 目录 mtime 19:01 |
| 19:03 / 19:06 | 出现 `REQ-260930190323-d86c` / `-f78e`（别的会话新建的需求） | `ls -lat docs/requirements/` |
| 19:24 | 出现 `REQ-000001` / `REQ-000002`（**测试夹具 id**，内含 `rtm-*.yml`） | 同目录（此时段恰有一次全量 `npx vitest run`） |
| 19:39 | `REQ-260930193929-897b` 出现；`REQ-260930182521-4fee` 更新 | 同目录 |
| 19:40 | 清点：**`REQ-260930094139-2d65` 整个目录不存在**；本需求仅剩 3 个文件 | `find docs/requirements/REQ-260930094139-2d65` → No such file or directory |

### 损失

- `REQ-260930094139-2d65`（状态 `accepting`，ledger 中仍有全部产物登记）：**需求目录整体丢失**，
  含 `requirement.md`、`design/`×5、`verification.md`（验收单所在）、`rtm-*.yml`、`tasks/`。文件层面不可恢复。
- 本需求 `REQ-260930183951-eb6c`：`requirement.md` 与 `design/`×5 丢失 → **已按原稿全部重建**（内容与已落章版本一致，
  ledger 中登记路径不变，故 `design_docs[].registered/confirmed` 仍为真，但 `on_disk` 一度为假）。

### 成因推断（两条，均有迹象、未最终定论）

1. **多会话共用工作树 + 覆写式同步**（与第一起同源）：`docs/` 与新建文件全部 untracked，
   一次 rsync/checkout/clean 即被替换或删除。
2. **测试把夹具写进了真实工作区**：`REQ-000001` / `REQ-000002` 只在测试里出现（`tests/*.test.ts` 多处用这两个 id），
   而它们出现在真实 `docs/requirements/` 下——说明有测试未把 docs 根重定向到临时目录；
   同一批测试里存在 `rmSync(join(reqDir, …), { recursive: true, force: true })` 这类清理，
   一旦 `reqDir` 落在真实工作区，就会**删真实目录**。

### 建议（按优先级）

1. **隔离工作区**：每个会话独立 git worktree / 克隆（本类事故的构造性根因）。
2. **把必须存在的文件纳入 git**：`cordis.patch.yml`（决定插件能否加载！）、`docs/`、新建 src/测试文件当前全是 untracked。
3. **排查并修掉"测试写真实工作区"**：给 `tests/**` 的 docs/queue 根做隔离（临时目录），
   并禁止在真实工作区路径上 `rmSync`；这值得单独立项（缺陷级）。
4. **2d65 的验收**：其需求目录已丢，验收材料无法复核；如需继续，须先按其 ledger 产物清单重建（或由人裁定取消/重开）。
