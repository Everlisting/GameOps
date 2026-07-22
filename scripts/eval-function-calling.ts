/**
 * 阶段10.1 · 国产模型 function-calling 横评脚本(B.10)。
 *
 * 用 mock 工具集(名称/描述/schema 与真实工具一致,execute 返回桩数据)跑 lib/assistant/eval-cases.ts,
 * 度量候选模型:工具选择正确率 / 参数正确率 / 无解题拒答率 / 多步能否走通。
 *
 * 运行(单模型):
 *   EVAL_PROVIDER=bailian EVAL_MODEL=qwen-max \
 *   EVAL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 \
 *   EVAL_API_KEY=sk-xxx pnpm eval:fc
 *
 * 运行(横评多模型):
 *   EVAL_CANDIDATES='[{"name":"qwen-max","provider":"bailian","model":"qwen-max","baseUrl":"...","apiKey":"sk-a"},
 *                     {"name":"mimo","provider":"mimo","model":"mimo-xxx","baseUrl":"...","apiKey":"sk-b"}]' pnpm eval:fc
 *
 * 过线标准(见 docs/ai-agent-plan.md §B.10):工具选择 ≥95%、参数 ≥90%、拒答 ≥90%。
 */
import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { EVAL_CASES } from "../lib/assistant/eval-cases";
import { TOOL_DEFS } from "../lib/assistant/tools/schemas";

function todayShanghai(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// 与 lib/assistant/agent.ts 一致:注入当前日期,否则模型对相对时间是瞎猜的。
const SYSTEM = `你是运营数据助手。回答用户问题时,只能通过提供的工具获取数据:选择最合适的工具并填好参数。
- 需要多步时(例如先定位活动、再解释激励),按需依次调用工具。
- 若用户要求修改数据(如改粉丝数),你没有对应工具,不要调用任何工具,直接说明无权修改。
- 未指定日期时,涉及统计的工具走其默认口径(本月)。

当前日期:${todayShanghai()}(Asia/Shanghai)。遇到"本月""上月""最近 N 天"等相对时间时,据此计算具体日期窗口:"本月"可省略日期参数,"上月"须传上一自然月的起止日。`;

/** 相对日期窗口校验:返回 true/false;非相对(或无从判断)返回 null 不计分。 */
function checkDateWindow(kind: unknown, args: Record<string, unknown> | undefined): boolean | null {
  const from = typeof args?.publishedFrom === "string" ? args.publishedFrom : undefined;
  const now = new Date();
  const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  if (kind === "本月默认") {
    // 省略日期(走默认本月)或显式落在本月,都算对
    return from ? from.startsWith(ym(now.getFullYear(), now.getMonth() + 1)) : true;
  }
  if (kind === "上月") {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return !!from && from.startsWith(ym(d.getFullYear(), d.getMonth() + 1));
  }
  return null;
}

interface Candidate {
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}

type RecordFn = (name: string, args: Record<string, unknown>) => void;

/** 桩返回:让模型能拿到"数据"继续(尤其多步的 activity_summary → incentive_explain)。 */
function makeMockTools(record: RecordFn): ToolSet {
  const asOf = new Date().toISOString();
  return {
    [TOOL_DEFS.streamerProfile.name]: tool({
      description: TOOL_DEFS.streamerProfile.description,
      inputSchema: TOOL_DEFS.streamerProfile.input,
      execute: async (args) => {
        record(TOOL_DEFS.streamerProfile.name, args as Record<string, unknown>);
        return { data: [{ nickname: "示例主播A", fansGained: 12000, views: 888888 }], asOf };
      },
    }),
    [TOOL_DEFS.videoSummary.name]: tool({
      description: TOOL_DEFS.videoSummary.description,
      inputSchema: TOOL_DEFS.videoSummary.input,
      execute: async (args) => {
        record(TOOL_DEFS.videoSummary.name, args as Record<string, unknown>);
        return { data: { totalViews: 1234567, worksCount: 321 }, asOf };
      },
    }),
    [TOOL_DEFS.activitySummary.name]: tool({
      description: TOOL_DEFS.activitySummary.description,
      inputSchema: TOOL_DEFS.activitySummary.input,
      execute: async (args) => {
        const a = args as Record<string, unknown>;
        record(TOOL_DEFS.activitySummary.name, a);
        if (a.activityId) {
          return { data: { activityId: a.activityId, enroll: 20, submissions: 35, incentiveTotal: 5000 }, asOf };
        }
        return {
          data: { activities: [{ activityId: "act_demo_best", name: "上月最佳活动", plays: 999999 }] },
          asOf,
        };
      },
    }),
    [TOOL_DEFS.incentiveExplain.name]: tool({
      description: TOOL_DEFS.incentiveExplain.description,
      inputSchema: TOOL_DEFS.incentiveExplain.input,
      execute: async (args) => {
        const a = args as Record<string, unknown>;
        record(TOOL_DEFS.incentiveExplain.name, a);
        return {
          data: [{ creatorId: a.creatorId ?? "c_demo", estimated: 500, breakdown: [{ rule: "TIER", amount: 500 }] }],
          asOf,
        };
      },
    }),
    [TOOL_DEFS.crawlerTaskStatus.name]: tool({
      description: TOOL_DEFS.crawlerTaskStatus.description,
      inputSchema: TOOL_DEFS.crawlerTaskStatus.input,
      execute: async (args) => {
        const a = args as Record<string, unknown>;
        record(TOOL_DEFS.crawlerTaskStatus.name, a);
        return { data: [{ id: "task_1", status: a.status ?? "FAILED", error: "命令非零退出" }], asOf };
      },
    }),
  };
}

/** 校验参数:返回 {checked, matched}。dateWindow 属相对口径,不自动判(人工看 args)。 */
function checkParams(
  expected: Record<string, unknown> | undefined,
  args: Record<string, unknown> | undefined,
): { checked: number; matched: number } {
  if (!expected || !args) return { checked: 0, matched: 0 };
  let checked = 0;
  let matched = 0;
  for (const [k, v] of Object.entries(expected)) {
    if (k === "dateWindow") continue;
    checked++;
    const a = args[k];
    if (k === "publishedFrom" || k === "publishedTo") {
      if (typeof a === "string" && a.endsWith(String(v))) matched++;
    } else if (a === v || String(a) === String(v)) {
      matched++;
    }
  }
  return { checked, matched };
}

function loadCandidates(): Candidate[] {
  const json = process.env.EVAL_CANDIDATES;
  if (json) {
    const parsed = JSON.parse(json) as Candidate[];
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("EVAL_CANDIDATES 需为非空 JSON 数组");
    return parsed;
  }
  const { EVAL_PROVIDER, EVAL_MODEL, EVAL_BASE_URL, EVAL_API_KEY } = process.env;
  if (EVAL_MODEL && EVAL_BASE_URL && EVAL_API_KEY) {
    return [
      {
        name: EVAL_PROVIDER ? `${EVAL_PROVIDER}/${EVAL_MODEL}` : EVAL_MODEL,
        provider: EVAL_PROVIDER ?? "custom",
        model: EVAL_MODEL,
        baseUrl: EVAL_BASE_URL,
        apiKey: EVAL_API_KEY,
      },
    ];
  }
  throw new Error(
    "请设置 EVAL_MODEL / EVAL_BASE_URL / EVAL_API_KEY(单模型),或 EVAL_CANDIDATES(JSON 数组,横评多模型)",
  );
}

function pct(n: number, d: number): string {
  if (d === 0) return "n/a";
  return `${((n / d) * 100).toFixed(1)}%`;
}

async function evalCandidate(cand: Candidate): Promise<void> {
  const provider = createOpenAICompatible({ name: cand.provider, baseURL: cand.baseUrl, apiKey: cand.apiKey });
  const model = provider(cand.model);

  let toolSelPass = 0;
  let refusalTotal = 0;
  let refusalPass = 0;
  let multiTotal = 0;
  let multiPass = 0;
  let paramChecked = 0;
  let paramMatched = 0;
  let dateTotal = 0;
  let datePass = 0;

  console.log(`\n=== 候选:${cand.name}(${cand.provider} · ${cand.model})===`);
  for (const c of EVAL_CASES) {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const tools = makeMockTools((name, args) => calls.push({ name, args }));

    try {
      await generateText({
        model,
        system: SYSTEM,
        prompt: c.question,
        tools,
        toolChoice: "auto",
        stopWhen: stepCountIs(6),
      });
    } catch (e) {
      console.log(`  [ERR ] ${c.id.padEnd(9)} ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    const called = calls.map((x) => x.name);
    let toolSel = false;
    if (c.expectedTool === null) {
      refusalTotal++;
      toolSel = called.length === 0;
      if (toolSel) refusalPass++;
    } else if (Array.isArray(c.expectedTool)) {
      multiTotal++;
      toolSel = c.expectedTool.every((t) => called.includes(t));
      if (toolSel) multiPass++;
    } else {
      toolSel = called.includes(c.expectedTool);
    }
    if (toolSel) toolSelPass++;

    let paramNote = "—";
    if (typeof c.expectedTool === "string" && c.expectedScope) {
      const call = calls.find((x) => x.name === c.expectedTool);
      const { checked, matched } = checkParams(c.expectedScope, call?.args);
      paramChecked += checked;
      paramMatched += matched;
      const dateOk = checkDateWindow(c.expectedScope.dateWindow, call?.args);
      if (dateOk !== null) {
        dateTotal++;
        if (dateOk) datePass++;
      }
      const dateTag = dateOk === null ? "" : dateOk ? " 日期✓" : " 日期✗";
      paramNote = (checked ? `参数 ${matched}/${checked}` : "—") + dateTag;
    }

    const flag = toolSel ? "OK  " : "MISS";
    const argsDump = calls.map((x) => `${x.name}(${JSON.stringify(x.args)})`).join(" → ") || "(未调用)";
    console.log(`  [${flag}] ${c.id.padEnd(9)} ${paramNote.padEnd(10)} ${argsDump}`);
  }

  const total = EVAL_CASES.length;
  console.log(`  ── 小结 ──`);
  console.log(`  工具选择正确率: ${pct(toolSelPass, total)}  (${toolSelPass}/${total})  [目标 ≥95%]`);
  console.log(`  参数正确率:     ${pct(paramMatched, paramChecked)}  (${paramMatched}/${paramChecked})  [目标 ≥90%]`);
  console.log(`  相对日期正确率: ${pct(datePass, dateTotal)}  (${datePass}/${dateTotal})  [本月/上月计算是否正确]`);
  console.log(`  无解题拒答率:   ${pct(refusalPass, refusalTotal)}  (${refusalPass}/${refusalTotal})  [目标 ≥90%]`);
  console.log(`  多步走通率:     ${pct(multiPass, multiTotal)}  (${multiPass}/${multiTotal})`);
}

async function main() {
  const candidates = loadCandidates();
  console.log(`function-calling 横评:${EVAL_CASES.length} 题 × ${candidates.length} 模型`);
  for (const cand of candidates) {
    await evalCandidate(cand);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
