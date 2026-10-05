# REQ-261001145152-3982 拆分清单（decomposition）

> 自动生成于 reqboard_decompose：计划任务表 ↔ 落库任务 id 对照

## §1 RTM 覆盖对照表（根编号 ↔ 任务卡）

| 根编号 | 计划 key | 任务 id | 标题 | 状态 |
|--------|---------|--------|------|------|
| —（未声明接收任何条款） | t-p0-1 | t-c63378 | 把 V2 服务救活并留下运行证据 | todo |
| —（未声明接收任何条款） | t-p0-2 | t-a4d449 | 补跑中断的行情与因子数据 | todo |
| —（未声明接收任何条款） | t-p0-3 | t-cf3f82 | 装外部存活与数据新鲜度探针 | todo |
| —（未声明接收任何条款） | t-p1-1 | t-504421 | 依赖声明收口（pyproject 为唯一权威） | todo |
| —（未声明接收任何条款） | t-p1-2 | t-649eb9 | 修 get_config() 空壳 | todo |
| —（未声明接收任何条款） | t-p1-3 | t-9ccd5e | 删重复实现（零引用项） | todo |
| —（未声明接收任何条款） | t-p1-4 | t-3f2444 | 修悬空 import + 裁决 BaseCalculator 双类 | todo |
| —（未声明接收任何条款） | t-p1-5 | t-2d52a7 | 调度去重：4 套 → 1 套（分步灰度） | todo |
| —（未声明接收任何条款） | t-p1-6 | t-59468b | 删 5 个孤儿的重复 provider | todo |
| —（未声明接收任何条款） | t-p2-1 | t-c3a097 | 挂上分层护栏（hook + 基线 + 纯净性断言） | todo |
| —（未声明接收任何条款） | t-p2-2 | t-4f6f4b | 消 application 层 12 处顶层越层导入 | todo |
| —（未声明接收任何条款） | t-p2-3 | t-686185 | 拆两个文件级上帝 | todo |
| —（未声明接收任何条款） | t-p2-4 | t-71051b | 端口与 DI 收敛 | todo |
| —（未声明接收任何条款） | t-p2-5 | t-52c511 | Repository 双轨收敛 + 修文档指向 | todo |
| —（未声明接收任何条款） | t-p2-6 | t-f04052 | 数据访问规则收口 + provider 归位 | todo |
| —（未声明接收任何条款） | t-p3-1 | t-720861 | docs 分层归位（140 个 md） | todo |
| —（未声明接收任何条款） | t-p3-2 | t-d4199a | git 产物出库（含 ignore 失效项） | todo |
| —（未声明接收任何条款） | t-p3-3 | t-6a02e6 | 体积与虚拟环境（先清 5.2G） | todo |
| —（未声明接收任何条款） | t-p3-4 | t-f777da | 修 CLAUDE.md 的 8 条矛盾 | todo |
| —（未声明接收任何条款） | t-p3-5 | t-008062 | 卫生债批量清理（550 处） | todo |
| —（未声明接收任何条款） | t-p3-6 | t-9b20eb | scripts/tools 归位 | todo |

## §2 任务清单

| 计划 key | 任务 id | 标题 | 阶段 | 端侧 | 依赖 | 验收标准 |
|---------|--------|------|------|------|------|---------|
| t-p0-1 | t-c63378 | 把 V2 服务救活并留下运行证据 | implement | backend | - | 跑 `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5001/docs` 看到 200；跑 `psql -h 127.0.0.1 -U mac -d quant_investment -At -c "select count(*) from quant.inprocess_job_runs"` 不报 relation 不存在；重启后 10 分钟内 `select max(started_at) from quant.scheduler_runs` 刷新到当日。 |
| t-p0-2 | t-a4d449 | 补跑中断的行情与因子数据 | implement | backend | t-c63378 | 跑 `psql -h 127.0.0.1 -U mac -d quant_investment -At -c "select max(trade_date) from quant.daily_klines"` 得到最近交易日（不再是 2026-09-11）；因子表最新日期与之一致；手动跑 `_job_freshness_guard` 返回 status='fresh'。 |
| t-p0-3 | t-cf3f82 | 装外部存活与数据新鲜度探针 | implement | backend | t-c63378 | 手工 kill 服务进程后 5 分钟内收到飞书告警（需留回执或截图）；把新鲜度阈值临时改为 0 天能立即告警，证明探针不是永不触发的空壳。 |
| t-p1-1 | t-504421 | 依赖声明收口（pyproject 为唯一权威） | implement | backend | t-c63378 | 跑 `python -m pytest --collect-only -q 2>&1 | tail -1` 显示 errors 为 0（当前 119）；`python -c "import pybreaker, pydantic_settings, jieba"` 无异常；`grep -c psycopg2-binary pyproject.toml` 为 0。 |
| t-p1-2 | t-649eb9 | 修 get_config() 空壳 | implement | backend | t-504421 | 跑 `python -c "from infrastructure.config import get_config; print(get_config('PGHOST','FALLBACK'))"` 返回真实 PGHOST 而非 FALLBACK；若走改调用方方案，`grep -rn get_config( domain application adapters infrastructure` 排除定义后为 0；服务启动日志无 DSN 异常。 |
| t-p1-3 | t-9ccd5e | 删重复实现（零引用项） | implement | backend | t-504421 | 删除前后 `python -m pytest tests/test_pipeline.py tests/test_integration.py -q` 结果一致；`grep -rn "infrastructure\.quantlib\.adapters\." --include='*.py' .` 只命中该目录内部或为 0；`find . -name "*.bak" -not -path "./venv/*" -not -path "./.venv/*" | wc -l` 为 0。 |
| t-p1-4 | t-3f2444 | 修悬空 import + 裁决 BaseCalculator 双类 | implement | backend | t-504421 | 逐个跑 `python -c "import tools.backfill_factors"` 等不再 ImportError；`python -c "import domain.quantlib.engine.ensemble_vote_strategy"` 不报错；`grep -c "^class BaseCalculator" domain/quantlib/base_calculator.py domain/quantlib/core/base_calculator.py` 只剩 1 处；相关测试通过。 |
| t-p1-5 | t-2d52a7 | 调度去重：4 套 → 1 套（分步灰度） | implement | backend | t-c63378 | 跑 `psql -h 127.0.0.1 -U mac -d quant_investment -At -c "select count(*) from (select cron_expression from quant.scheduler_tasks where is_enabled group by 1 having count(*)>1) t"` 为 0；连续 3 个交易日 quant.inprocess_job_runs 每个 job 每日仅 1 条 success；`grep -rn unified_scheduler --include='*.py' adapters/` 收敛到 0 或 1 个明确入口。 |
| t-p1-6 | t-59468b | 删 5 个孤儿的重复 provider | implement | backend | t-504421 | 跑 `grep -rn "financial_providers\." --include='*.py' . | grep -v "financial_providers/" | wc -l` 为 0；`python -c "from adapters.outbound.datasources.manager import get_data_provider_manager"` 正常；取数相关测试通过。 |
| t-p2-1 | t-c3a097 | 挂上分层护栏（hook + 基线 + 纯净性断言） | implement | backend | t-504421 | 跑 `git config --get core.hooksPath` 得到 .git-hooks；在 application/ 顶层故意加一行越层导入后 git commit 被 hook 拦下（留拦截输出）；`pytest tests/test_layer_purity.py` 在无新增违规时通过。 |
| t-p2-2 | t-4f6f4b | 消 application 层 12 处顶层越层导入 | implement | backend | t-c3a097 | 跑 `venv/bin/python tools/analyze_layer_violations.py | grep 违规导入总数` 顶层部分降为 0；`grep -rn "^from infrastructure.notification.channels" application/` 为 0；`pytest tests/notification -q` 通过。 |
| t-p2-3 | t-686185 | 拆两个文件级上帝 | implement | backend | t-c3a097 | 跑 `python -m pytest tests/test_false_success_guard.py tests/e2e -q` 拆分前后结果一致；两个文件行数均 < 400；JOBS 列表内容与顺序 diff 为空。 |
| t-p2-4 | t-71051b | 端口与 DI 收敛 | implement | backend | t-4f6f4b | 跑 `comm -12 <(grep -oE "^class I[A-Za-z]+" domain/ports/repository_ports.py | sort) <(grep -oE "^class I[A-Za-z]+" domain/ports/repository_ports_extended.py | sort)` 为空；DI 入口收敛为 1 个；全量测试基线不退化。 |
| t-p2-5 | t-52c511 | Repository 双轨收敛 + 修文档指向 | implement | backend | t-c3a097 | 跑 `ls adapters/outbound/repositories/*async*.py` 收敛策略符合裁定；`grep -rn "infrastructure/repositories" --include='*.md' .` 为 0；相关仓储测试通过。 |
| t-p2-6 | t-f04052 | 数据访问规则收口 + provider 归位 | implement | backend | t-c3a097 | 跑 `grep -rn "import akshare\|import tushare\|import baostock\|import yfinance" --include='*.py' application domain | wc -l` 为 0；两个 provider 包已按裁定处置；相关取数测试通过。 |
| t-p3-1 | t-720861 | docs 分层归位（140 个 md） | doc | doc | - | 跑 `find docs -maxdepth 1 -name "*.md" | wc -l` 只剩 1（README.md）；`python3 agent-dh/scripts/wiki_probe.py` 无死链/孤儿页；`git status` 显示 rename 而非增删。 |
| t-p3-2 | t-d4199a | git 产物出库（含 ignore 失效项） | implement | backend | - | 跑 `git ls-files | grep -cE "\.(pyc|pkl|log)$"` 为 0；`git ls-files .pi-invest | wc -l` 为 0；`git check-ignore -v scripts/<任一文件>` 与实际跟踪状态一致；`git status` 无文件被物理删除；pytest 基线不退化。 |
| t-p3-3 | t-6a02e6 | 体积与虚拟环境（先清 5.2G） | implement | backend | - | 跑 `du -sh live_trading/logs` 显著下降；`du -sh .` 合计下降 ≥5G；触发一次日志轮转可见 .1 文件；服务重启后仍能正常写日志。 |
| t-p3-4 | t-f777da | 修 CLAUDE.md 的 8 条矛盾 | doc | doc | - | audit-report §5.6 的 8 条命令逐条复核通过；`grep -rn "pip install -r requirements.txt" --include='*.md' . | wc -l` 为 0 或全部指向真实存在的文件。 |
| t-p3-5 | t-008062 | 卫生债批量清理（550 处） | implement | backend | t-504421 | 跑 `grep -rn "except:" domain application adapters infrastructure --include="*.py" | wc -l` 为 0；`grep -rln "logging.basicConfig" --include="*.py" domain application adapters infrastructure | wc -l` 为 0；库层 `grep -rn "sys.path.insert" --include="*.py" infrastructure | wc -l` 为 0；全量测试基线不退化。 |
| t-p3-6 | t-9b20eb | scripts/tools 归位 | implement | backend | - | 跑 `ls scripts/test_*.py | wc -l` 为 0；5 个一次性脚本已删；`grep -rn "scripts/test_orm" --include='*.md' .` 为 0 或指向新路径；`pytest --collect-only -q` 收集数比迁移前增加。 |
