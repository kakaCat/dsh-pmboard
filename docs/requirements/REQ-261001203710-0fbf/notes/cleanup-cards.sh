#!/usr/bin/env bash
# 清场脚本（REQ-261001203710-0fbf）——**由人运行**：取消任务属人工门，agent 不可代操作。
# 依据：docs/requirements/REQ-261001203710-0fbf/notes/cleanup-plan.md（56 条逐 ID 可核对）
# 走看板自己的通道：POST /dashboard/api/reqboard/task/move（actor=human）
# 先干跑：DRY=1 bash cleanup-cards.sh   （只打印不执行）
set -u
BASE=${BASE:-http://127.0.0.1:19387}
DRY=${DRY:-0}
ok=0
fail=0
n=0
REASON="清场：回退机制膨胀产物（见 notes/cleanup-plan.md）；由窗口 agent 按用户明确授权代执行"
for id in \
  t-71547a t-def336 t-99bbf9 t-8437a4 t-37e2c7 t-4176c9 \
  t-2ce1d4 t-c8b15f t-f57ec7 t-4ba5d0 t-88101b t-49d033 \
  t-6ab16e t-7ff31b t-e5507b t-fded59 t-3ff902 t-dbc780 \
  t-745c56 t-8ba769 t-04a1be t-88e476 t-309e22 t-38dfba \
  t-03abd0 t-869332 t-171e12 t-55aa94 t-2370f6 t-80ef84 \
  t-8f4c06 t-d39abd t-e91402 t-780c6e t-498dd9 t-90e047 \
  t-aab162 t-2ecfb2 t-0c2426 t-a908ab t-471027 t-28d05a \
  t-2737ef t-fc37d6 t-d050dc t-dc73a6 t-402577 t-7db770 \
  t-7706a5 t-6ff93d t-edcfdc t-bce49d t-3c923f
do
  if [ "$DRY" = "1" ]; then echo "[dry] $id"; else
    # ⚠️ 必须看**响应体**，不能只看 curl 退出码：服务端返回 404/错误时 curl 仍是 0（实测踩过：
    #    一次「53 张全部成功」其实是 53 次 404，台账一张未动——假绿）。
    resp=$(curl -s -X POST "$BASE/dashboard/api/reqboard/task/move" \
      -H "content-type: application/json" \
      -d "{\"id\":\"$id\",\"to\":\"canceled\",\"actor\":\"human\",\"reason\":\"$REASON\"}")
    case "$resp" in
      *'"success":true'*) ok=$((ok+1)); echo "cancelled $id" ;;
      *) fail=$((fail+1)); echo "FAILED $id -> $resp" ;;
    esac
  fi
  n=$((n+1))
done
echo "done: tried $n | ok $ok | failed $fail (expect ok=53)"
if [ "$fail" != "0" ]; then
  echo "WARN: some cancels failed -> host task store cannot see these cards (the bug this REQ fixes). Restart the host, then rerun."
fi
