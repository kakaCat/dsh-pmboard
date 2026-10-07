/**
 * 需求文档位置（面板显示用）——**面板不再自己拼路径**。
 *
 * 事故出处（2026-10-06 用户现场）：会话右上角流程面板的「📂 文档位置」写死拼
 * `docs/requirements/<id>/`（`node-panel.ts`），而用户在**立项四问**里选的文档位置
 * （台账 `docBasePath`）压根没参与渲染——面板显示相对路径、文件其实在需求自己工作区的
 * 绝对路径下，两处对不上；换过位置的需求（`docs/rfcs/` 等）更会指到另一个目录。
 *
 * 口径（三条，缺一不可）：
 *  ① **目录来自台账**：`docBasePath` 由 `domain/requirement/DocLocation` 解析（与 host 落盘同一函数，
 *     不新造拼法）；取不到台账 → 回落旧口径 `docs/requirements/<id>/` 并标 `fromLedger=false`
 *     （**不假装**拿到了取值）。
 *  ② **绝对路径来自需求自己的工作区根**：`RequirementRecord.workspaceRoot` 优先；
 *     缺省再走既有的绝对化链路（`absolutizeDocPath`）——与详情页/右侧栏同一口径。
 *  ③ **取不到就不编**：绝对路径拼不出时只给相对目录（原样显示），不造一个必然不存在的绝对路径。
 *
 * 取数：`GET /requirements/:id`（一次，按 reqId 缓存 + in-flight 去重）。为什么不走流程面板
 * 自己的 `/progress`：那条载荷只有摘要字段，没有 `docBasePath`/`workspaceRoot`；而详情端点
 * 已有且是既有链路（`req-detail-store` 的同一份数据）。
 *
 * @module dsh-pmboard/client/req-doc-location
 */
import { fetchRequirement } from './api.ts'
import { absolutizeDocPath, displayDocPath } from './open-doc.ts'
import { requirementDocDirOf } from '../domain/requirement/DocLocation.js'

/** 面板要显示的一份文档位置。 */
export interface DocLocationView {
  /** 工作区相对目录（无尾斜杠），如 `docs/requirements/REQ-x`。 */
  dir: string
  /** 绝对路径（拿得到需求自身工作区根时才给）。 */
  abs?: string
  /** false = 台账没取到（用的是旧口径回落值，别当"用户选的就是这个"）。 */
  fromLedger: boolean
}

const cache = new Map<string, DocLocationView>()
const inflight = new Map<string, Promise<DocLocationView>>()

/** 旧口径回落（老服务端 / 取数失败时逐字回改造前的显示值）。 */
function fallbackDir(reqId: string): string {
  return 'docs/requirements/' + reqId
}

function build(reqId: string, docBasePath: string | undefined, workspaceRoot: string | undefined): DocLocationView {
  const fromLedger = typeof docBasePath === 'string' && docBasePath.length > 0
  const dir = fromLedger ? requirementDocDirOf({ id: reqId, docBasePath }) : fallbackDir(reqId)
  const root = typeof workspaceRoot === 'string' && workspaceRoot.length > 0
    ? workspaceRoot.replace(/\/+$/, '')
    : undefined
  const abs = root !== undefined
    ? root + '/' + dir
    : absolutizeDocPath(dir)
  // absolutizeDocPath 在没有缓存根时原样返回相对路径——那就不是绝对路径，不给 abs（②③两条）。
  return {
    dir,
    ...(abs.startsWith('/') || /^[A-Za-z]:/.test(abs) ? { abs } : {}),
    fromLedger,
  }
}

/**
 * 取该需求的文档位置（带缓存）。取数失败 → 返回旧口径回落值（`fromLedger=false`），
 * **不抛错**：面板宁可显示旧口径，也不能因为一次详情请求失败而少一行。
 */
export function fetchDocLocation(reqId: string): Promise<DocLocationView> {
  const hit = cache.get(reqId)
  if (hit !== undefined) return Promise.resolve(hit)
  const running = inflight.get(reqId)
  if (running !== undefined) return running
  const p = fetchRequirement(reqId)
    .then(({ requirement }) => build(reqId, requirement.docBasePath, requirement.workspaceRoot))
    .catch(() => build(reqId, undefined, undefined))
    .then((view) => {
      cache.set(reqId, view)
      inflight.delete(reqId)
      return view
    })
  inflight.set(reqId, p)
  return p
}

/** 已缓存的位置（没有 = 还没取到；渲染方据此走旧口径）。 */
export function peekDocLocation(reqId: string): DocLocationView | undefined {
  return cache.get(reqId)
}

/** 测试/切换需求时清缓存（面板换需求不必重取，但换工作区后要重取）。 */
export function clearDocLocation(reqId?: string): void {
  if (reqId === undefined) cache.clear()
  else cache.delete(reqId)
}

/**
 * 「文档位置」一行的 HTML（📂 行与立项五问块共用同一份渲染，避免两处各写一遍）。
 *
 * 显示绝对路径（拿得到时），后面跟小字「台账路径：<相对>」供对账——与详情页
 * `views/panels/docs.ts` 的 `openablePath` 同一形态（同一件事两处显示应当长得一样）。
 */
export function docLocationHtml(view: DocLocationView | undefined, reqId: string): string {
  const dir = view?.dir ?? fallbackDir(reqId)
  // 目录以 `/` 收尾显示（它是**目录**不是文件）；`data-doc-dir` 里留规范形态（无尾斜杠）供断言与对账。
  const withSlash = (p: string): string => (p.endsWith('/') ? p : p + '/')
  const shown = withSlash(view?.abs !== undefined ? view.abs : (view === undefined ? absolutizeDocPath(dir) : dir))
  const hint = shown === withSlash(dir)
    ? ''
    : '<span class="dsh-pm-hint" data-doc-relpath="' + escAttr(dir) + '">台账路径：' + escAttr(withSlash(dir)) + '</span>'
  return '<span class="dsh-pm-doc-filepath" data-doc-dir="' + escAttr(dir) + '"'
    + (view?.fromLedger === true ? ' data-doc-from-ledger="yes"' : '')
    + ' title="' + escAttr(displayDocPath(shown)) + '">' + escAttr(shown) + '</span>' + hint
}

/** 最小转义（本模块不 import 渲染层，避免把面板模块拖进来）。 */
function escAttr(s: string): string {
  return s
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
}
