//#region src/application/use-cases/AskConfirm.ts
async function askConfirm(deps, args, exec) {
	const windowKey = agentIdFromExec(deps, exec);
	requireLiveDriver(deps, exec);
	const a = args ?? {};
	const explicitId = normalizeText(a.requirement_id, "requirement_id", 64);
	const targetKind = normalizeText(a.target, "target", 32);
	const kindRaw = normalizeText(a.kind, "kind", 64);
	const question = clip$1(normalizeText(a.question, "question", 2e3), LIMITS.popupQuestionMax);
	const options = Array.isArray(a.options) ? a.options.map((o) => normalizeText(o, "options[]", 200)).filter((o) => o.length > 0).slice(0, 5) : [];
	const advance = a.advance !== false;
	if (question.length === 0) reject("reqboard_ask_confirm 未执行：question 不能为空", "REQBOARD_INVALID_INPUT");
	if (targetKind !== "artifact" && targetKind !== "plan") reject("reqboard_ask_confirm 未执行：target 只能是 artifact 或 plan", "REQBOARD_INVALID_INPUT");
	if (targetKind === "artifact" && !ALL_ARTIFACT_KINDS.includes(kindRaw)) reject("reqboard_ask_confirm 未执行：kind 必须是 " + ALL_ARTIFACT_KINDS.join(" / "), "REQBOARD_INVALID_INPUT");
	const graceRaw = a.inline_grace_ms;
	if (graceRaw !== void 0 && (typeof graceRaw !== "number" || !Number.isFinite(graceRaw) || graceRaw <= 0)) reject("reqboard_ask_confirm 未执行：inline_grace_ms 必须是正数（毫秒）", "REQBOARD_INVALID_INPUT");
	const optionLabels = options.length > 0 ? options : [...DEFAULT_CONFIRM_OPTIONS];
	const popupQuestion = targetKind === "plan" ? clip$1(fmt("{q}（批准后将自动拆分任务卡并立即开跑，中途不再打断；如需干预可在看板暂停或取消）", { q: question }), LIMITS.popupQuestionMax) : question;
	const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey);
	if (bound.length === 0) reject("reqboard_ask_confirm 未执行：本窗口没有绑定中的需求", "REQBOARD_NO_BOUND_REQ");
	const picked = explicitId.length > 0 ? bound.find((r) => r.id === explicitId) : bound[0];
	if (picked === void 0) reject("reqboard_ask_confirm 未执行：需求 " + explicitId + " 不是本窗口绑定的进行中需求", "REQBOARD_NOT_BOUND_TO_WINDOW");
	const targetReq = await requirementStoreOf(deps).get(picked.id);
	if (targetReq === void 0) reject(fmt("需求 {id} 不在台账中", { id: picked.id }), "REQBOARD_REQUIREMENT_NOT_FOUND");
	const kindArts = (targetReq.artifacts ?? []).filter((a) => a.kind === kindRaw);
	const alreadyConfirmed = targetKind === "artifact" ? kindArts.length > 0 && kindArts.every((a) => a.confirmedAt !== void 0) : targetReq.plan?.approvedAt !== void 0;
	const planAwaitingAdvance = targetKind === "plan" && targetReq.plan?.approvedAt !== void 0 && targetReq.status === "decomposing";
	if (alreadyConfirmed && !planAwaitingAdvance) {
		let earlyGate;
		if (targetKind === "artifact" && kindRaw === "design") {
			applyRequirementWorkspaceRoot(deps, targetReq);
			earlyGate = await checkDesignCompletenessGate(deps.docs, targetReq);
		}
		const unregistered = (earlyGate?.gaps ?? []).filter((g) => g.includes("未登记")).length;
		const gapNote = earlyGate === void 0 ? "" : fmt("；design → decomposing 未推进：{msg}", { msg: earlyGate.message }) + (unregistered > 0 ? fmt("。仍有 {n} 份未登记", { n: unregistered }) : "");
		return {
			success: true,
			confirmed: true,
			advanced: false,
			requirement_id: targetReq.id,
			...earlyGate !== void 0 ? { gate_failure: earlyGate } : {},
			note: (targetKind === "artifact" ? "产物 " + kindRaw + " 已确认，未重复弹框（FR-9/FR-11）" : "拆分计划已批准，未重复弹框（FR-9/FR-11）") + gapNote
		};
	}
	if (!deps.questions.available()) return {
		success: false,
		confirmed: false,
		advanced: false,
		fallback: "board",
		note: "弹框通道不可用（userQuestions 服务缺失）：请用户到项目看板点确认按钮；或由 agent 改用 ask_user_question + reqboard_confirm_artifact 两步走"
	};
	const gateId = gateFromStage(targetReq.status)?.id;
	const submitted = {
		requirementId: targetReq.id,
		windowKey,
		target: targetKind,
		kind: kindRaw,
		question,
		optionLabels,
		advance
	};
	const ask = deps.questions.ask([{
		id: "confirm",
		question: popupQuestion,
		header: pmHeader("确认"),
		options: optionLabels.map((label, i) => ({
			label,
			...i === 0 ? { description: "确认后自动落章并推进" } : {}
		}))
	}], {
		...exec.agent !== void 0 ? { agent: exec.agent } : {},
		signal: exec.signal,
		...gateId === void 0 ? {} : { gate: gateId }
	});
	const port = deps.pendingConfirms;
	if (graceRaw !== void 0 && port === void 0) reject(fmt("reqboard_ask_confirm 未执行：显式 inline_grace_ms（{g}）需要挂起确认能力，本实例未装配（pendingConfirms 缺省）——不传宽限即缺省阻塞等待，或修复装配（REQBOARD_NONBLOCK_UNAVAILABLE）", { g: String(graceRaw) }), "REQBOARD_NONBLOCK_UNAVAILABLE");
	let ticket;
	if (port !== void 0) {
		for (let stale = port.pendingForWindow(windowKey); stale !== void 0; stale = port.pendingForWindow(windowKey)) port.settle(stale.ticket, {
			confirmed: false,
			advanced: false
		});
		ticket = port.register({
			windowKey,
			requirementId: targetReq.id,
			target: targetKind,
			...targetKind === "artifact" ? { kind: kindRaw } : {}
		}).ticket;
	}
	const dialogRef = ticket ?? fmt("dlg-confirm-{id}-{at}", {
		id: targetReq.id,
		at: deps.clock.now()
	});
	const awaiting = {
		store: requirementStoreOf(deps),
		...deps.dialogs === void 0 ? {} : { dialogs: deps.dialogs },
		now: () => deps.clock.now(),
		...deps.alert === void 0 ? {} : { alert: deps.alert }
	};
	const exitAwaiting = async (reason) => {
		await exitAwaitingConfirm(awaiting, {
			requirementId: targetReq.id,
			ref: dialogRef,
			reason
		});
	};
	enterAwaitingConfirm(awaiting, {
		requirementId: targetReq.id,
		windowKey,
		ref: dialogRef,
		kind: "confirm",
		suspend: graceRaw !== void 0,
		question
	});
	if (graceRaw === void 0) {
		let answers;
		try {
			answers = await ask;
		} catch (err) {
			const body = handleAskFailure(deps, exec, err, ticket, targetReq.id);
			await exitAwaiting("canceled");
			return body;
		}
		const body = await settleAnswers(deps, exec, answers, submitted);
		if (port !== void 0 && ticket !== void 0) port.settle(ticket, outcomeOf(body));
		await exitAwaiting("answered");
		return body;
	}
	const raced = await raceAsk(ask, graceRaw);
	if (raced.kind === "answered") {
		const body = await settleAnswers(deps, exec, raced.answers, submitted);
		if (port !== void 0 && ticket !== void 0) port.settle(ticket, outcomeOf(body));
		await exitAwaiting("answered");
		return body;
	}
	if (raced.kind === "rejected") {
		const body = handleAskFailure(deps, exec, raced.err, ticket, targetReq.id);
		await exitAwaiting("degraded");
		return body;
	}
	const guardedAsk = ask.then((a) => a, (err) => {
		exitAwaiting("canceled");
		throw err;
	});
	return suspendConfirm(deps, guardedAsk, submitted, ticket, async (answers) => {
		try {
			return await settleAnswers(deps, exec, answers, submitted);
		} finally {
			await exitAwaiting("answered");
		}
	});
}
/**
* 弹框抛错的两条降级（与改造前逐字一致）：无弹框权限 → `fallback=board`；
* 取消/暂离（ASK_ABORTED 等）→ 中性返回，**不算错误**。
*/
function degradedAnswer(err) {
	const code = err.code ?? "";
	if (code === "DELEGATED_CALLER" || code === "CALLER_NOT_LIVE") return {
		success: false,
		confirmed: false,
		advanced: false,
		fallback: "board",
		note: "当前调用方无弹框权限（subagent/非活窗口）：请用户到项目看板点确认按钮完成本次确认"
	};
	return {
		success: false,
		confirmed: false,
		advanced: false,
		note: "用户未作答（取消/暂离）：节点未推进。稍后可重新发起 reqboard_ask_confirm"
	};
}
/**
* 弹框在等待/赛跑期间失败或中止的统一处置（REQ-260927123256-196b FR-4 / I-1）：
*   · `ASK_ABORTED` 或 `exec.signal.aborted` → **响亮留痕**：`markInterrupted(ticket)`
*     （守卫继续拦，直到人作答或显式解除），返回 `pending:true + ticket + interrupted:true`；
*   · 其余（`ASK_CANCELLED` 用户取消 / `DELEGATED_CALLER` 等降级）→ `settle`（守卫放行）后
*     走**与改造前逐字一致**的 `degradedAnswer`。
*
* 未装配注册表时没有可留痕的 ticket（仅测试/旧装配形态）：中止按中性降级返回——
* 绝不把一次中止静默伪装成「已确认」或「成功」。
*/
function handleAskFailure(deps, exec, err, ticket, requirementId) {
	const port = deps.pendingConfirms;
	if (((err.code ?? "") === "ASK_ABORTED" || exec?.signal?.aborted === true) && port !== void 0 && ticket !== void 0) {
		port.markInterrupted(ticket);
		return interruptedBody(ticket, requirementId);
	}
	if (port !== void 0 && ticket !== void 0) port.settle(ticket, {
		confirmed: false,
		advanced: false
	});
	return degradedAnswer(err);
}
/**
* 阻塞等待被中止的返回体（I-1 中止分支）：`pending:true + ticket + interrupted:true`。
* note 必含两条恢复命令（取回执 / 看板确认）与「收到作答前不得产出下游产物」。
*/
function interruptedBody(ticket, requirementId) {
	return {
		success: false,
		confirmed: false,
		advanced: false,
		pending: true,
		ticket,
		requirement_id: requirementId,
		interrupted: true,
		note: fmt("本次确认等待已被中止（弹框可能已消失），已留下可查的挂起记录（ticket={t}）。**收到作答前不得产出下游产物**（本窗口 reqboard_submit / reqboard_decompose / reqboard_move / reqboard_task_move 会被代码级拒绝）。恢复路径：① 调 reqboard_confirm_receipt(ticket=\"{t}\") 取回执；② 到项目看板点确认按钮；③ 重新发起 reqboard_ask_confirm 覆盖旧记录。", { t: ticket })
	};
}
/**
* 已作答 → 裁决（同步路径与后台续跑共用）。非肯定项只留痕不推进；肯定项走
* \`applyConfirmDecision\`（落章 + 可选推进 + 批准计划的门合并开跑）。
* 返回体形状与改造前逐字一致（output-contract 静态扫描逐键对账）。
*/
async function settleAnswers(deps, exec, answers, s) {
	const answer = answers[0];
	const picked = answer?.selected?.[0] ?? answer?.custom ?? "";
	const affirmative = picked.length > 0 && picked === s.optionLabels[0];
	const nowTs = deps.clock.now();
	if (!affirmative) {
		const userFeedback = answer?.custom?.trim() ?? "";
		await recordDeclinedConfirmation(deps, {
			requirementId: s.requirementId,
			windowKey: s.windowKey,
			question: s.question,
			picked,
			userFeedback,
			nowTs
		});
		return {
			success: true,
			confirmed: false,
			advanced: false,
			user_choice: picked || "（未选）",
			user_feedback: userFeedback.length > 0 ? userFeedback : void 0,
			note: fmt("用户选择\"{picked}\"：未落章、未推进。{feedback}按用户意见修改后可重新发起确认", {
				picked: picked || "（未选）",
				feedback: userFeedback.length > 0 ? fmt("用户反馈：{fb}。", { fb: userFeedback }) : ""
			})
		};
	}
	const outcome = await applyConfirmDecision(deps, exec, {
		requirementId: s.requirementId,
		windowKey: s.windowKey,
		target: s.target,
		kind: s.kind,
		question: s.question,
		picked,
		nowTs,
		advance: s.advance
	});
	return {
		success: true,
		confirmed: true,
		advanced: outcome.advanced,
		from: outcome.from,
		to: outcome.to,
		requirement_id: s.requirementId,
		...outcome.gateFailure !== void 0 ? { gate_failure: outcome.gateFailure } : {},
		note: outcome.note
	};
}

//#endregion
