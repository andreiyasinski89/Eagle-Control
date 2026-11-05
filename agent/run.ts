import { db } from "@/server/db";
import { assertAiAllowed } from "@/server/ai";
import { cleanAgentSettings } from "@/modules/crm/agent-settings";
import { ApiError, forbidden } from "@/server/http/errors";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { anthropicModel, type AgentModel, type Block, type Msg } from "./model";
import { promptsFor, ROLES, type AgentRole } from "./roles";
import { timersTableFor } from "./timers";
import { dayReportFor } from "./day-report";
import { toolByName, toolDefs, type AgentContext } from "./tools";

const MAX_TURNS = 12;
const MAX_TOKENS = 4096;
/** What one tool result may add to the conversation, and how much of it the log keeps. */
const RESULT_LIMIT = 30_000;
const LOG_LIMIT = 4_000;

export interface ToolCallLog {
  name: string;
  input: unknown;
  output: string;
  isError: boolean;
  ms: number;
}

export interface RunOptions extends AgentContext {
  role: AgentRole;
  /** Fills {user_name}, {goal}, {deadline}, {touches_per_day}, {meetings_per_day} and the role's own variables. */
  vars: Record<string, string | number>;
  model?: AgentModel;
  maxTurns?: number;
  /** The moment the run is about; tests pin it. */
  now?: Date;
  /** YYYY-MM-DD; lets the evening report say how many days are left. */
  deadlineDate?: string;
}

export interface RunResult {
  id: string;
  output: string;
  toolCalls: ToolCallLog[];
  tokens: number;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…[+${s.length - n}]` : s);

async function callTool(ctx: AgentContext, name: string, input: Record<string, unknown>): Promise<{ output: string; isError: boolean }> {
  const t = toolByName.get(name);
  if (!t) return { output: `Unknown tool: ${name}`, isError: true };
  try {
    const args = t.schema.parse(input);
    const result = await t.run(ctx, args as never);
    return { output: clip(JSON.stringify(result ?? null), RESULT_LIMIT), isError: false };
  } catch (e) {
    // The model gets the reason and may correct itself; stack traces stay out of the conversation.
    return { output: e instanceof Error ? e.message : "Tool failed", isError: true };
  }
}

/**
 * Runs one role: the system prompt and the role prompt are filled from `vars`, the model may call the CRM tools
 * until it answers in text, and the whole run (input, output, tool calls, tokens) is stored in agent_runs.
 * The agent has no tool that sends anything to a person; it only drafts.
 */
export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const member = await loadWorkspaceMember(db, opts.userId, opts.workspaceId, "crm:read");
  if (member.role === "GUEST") throw forbidden();
  // The agent spends the same AI allowance as every other AI feature and obeys the plan; a day's runs are capped by the person's own limit.
  await assertAiAllowed(opts.userId, opts.workspaceId);
  const { dailyRunLimit } = cleanAgentSettings(member.agentSettings);
  const recent = await db.agentRun.count({ where: { userId: opts.userId, workspaceId: opts.workspaceId, createdAt: { gte: new Date((opts.now ?? new Date()).getTime() - 86_400_000) } } });
  if (recent >= dailyRunLimit) throw new ApiError(429, "agent_daily_limit", `The agent already ran ${recent} times in the last 24 hours (the limit in its settings is ${dailyRunLimit}).`);

  let vars = opts.vars;
  let silentCount: number | null = null;
  if (opts.role === "stale_followups" && vars.timers_table === undefined) {
    // The table is data from the CRM, not something the caller types: the run builds it from the timers.
    const t = await timersTableFor(opts.userId, opts.workspaceId, opts.now);
    vars = { ...vars, timers_table: t.table };
    silentCount = t.count;
  }
  if (opts.role === "evening_report" && vars.day_report === undefined) vars = { ...vars, day_report: await dayReportFor(opts.userId, opts.workspaceId, opts.now, opts.deadlineDate) };
  const { system, user } = promptsFor(opts.role, vars);
  const model = opts.model ?? anthropicModel;
  const ctx: AgentContext = { userId: opts.userId, workspaceId: opts.workspaceId, seen: new Set() };
  const noTools = "noTools" in ROLES[opts.role];
  const tools = noTools ? [] : toolDefs();
  const messages: Msg[] = [{ role: "user", content: user }];
  const toolCalls: ToolCallLog[] = [];
  let inTokens = 0;
  let outTokens = 0;
  let modelName = "unknown";
  let output = "";
  let lastStop = "none";
  let steps = 0;

  const save = async (text: string) => {
    const run = await db.agentRun.create({
      data: { workspaceId: opts.workspaceId, userId: opts.userId, role: opts.role, input: user, output: text, toolCalls: toolCalls as never, tokens: inTokens + outTokens, ...(opts.now ? { createdAt: opts.now } : {}) },
    });
    // Counts toward the workspace's monthly AI allowance, like every other AI feature.
    if (inTokens + outTokens > 0) await db.aiUsage.create({ data: { workspaceId: opts.workspaceId, userId: opts.userId, feature: `agent:${opts.role}`, model: modelName, inputTokens: inTokens, outputTokens: outTokens } });
    return run.id;
  };

  if (silentCount === 0) {
    // Nothing to follow up: no model call, no tokens spent, but the check is still on record.
    const output = "Просроченных таймеров тишины нет.";
    return { id: await save(output), output, toolCalls, tokens: 0 };
  }

  try {
    const turns = opts.maxTurns ?? MAX_TURNS;
    for (let turn = 0; turn < turns; turn++) {
      // The last turn is for the answer: without this a model that keeps reading the CRM runs out of turns and leaves nothing to show.
      const last = turn === turns - 1 && turn > 0;
      if (last) {
        const prev = messages[messages.length - 1];
        if (prev && Array.isArray(prev.content)) prev.content = [...prev.content, { type: "text", text: "Лимит шагов исчерпан. Больше не вызывай инструменты: ответь сейчас текстом по тому, что уже собрано." }];
      }
      const reply = await model.complete({ system, messages, tools, maxTokens: MAX_TOKENS, ...(last ? { forbidTools: true } : {}) });
      inTokens += reply.inputTokens;
      outTokens += reply.outputTokens;
      modelName = reply.model;
      lastStop = reply.stopReason;
      steps++;
      messages.push({ role: "assistant", content: reply.content });
      const text = reply.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("").trim();
      const uses = reply.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
      if (text) output = text;
      if (noTools || reply.stopReason !== "tool_use" || uses.length === 0) break;

      const results: Block[] = [];
      for (const use of uses) {
        const started = Date.now();
        const r = await callTool(ctx, use.name, use.input);
        toolCalls.push({ name: use.name, input: use.input, output: clip(r.output, LOG_LIMIT), isError: r.isError, ms: Date.now() - started });
        results.push({ type: "tool_result", tool_use_id: use.id, content: r.output, is_error: r.isError });
      }
      messages.push({ role: "user", content: results });
    }
    if (!output && messages.length > 1) {
      // One more try with no tools allowed: the model has read what it needs and only has to say it.
      const ask = "Ответь сейчас текстом по тому, что уже известно. Инструменты не вызывай.";
      // An empty assistant message at the end would be refused by the API, so it is left out.
      const base = messages.at(-1)?.role === "assistant" && Array.isArray(messages.at(-1)!.content) && (messages.at(-1)!.content as Block[]).length === 0 ? messages.slice(0, -1) : messages;
      const last = base[base.length - 1]!;
      const closing: Msg[] = last.role === "user" ? [...base.slice(0, -1), { role: "user", content: [...(typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content), { type: "text", text: ask }] }] : [...base, { role: "user", content: ask }];
      const reply = await model.complete({ system, messages: closing, tools, maxTokens: MAX_TOKENS, forbidTools: true });
      inTokens += reply.inputTokens;
      outTokens += reply.outputTokens;
      lastStop = reply.stopReason;
      output = reply.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("").trim();
    }
    if (!output) throw new ApiError(502, "agent_empty", `The agent finished without an answer (last stop: ${lastStop}, steps: ${steps}, tool calls: ${toolCalls.length}). Try again.`);
  } catch (e) {
    await save(`[error] ${e instanceof Error ? e.message : "failed"}`);
    throw e;
  }
  const id = await save(output);
  return { id, output, toolCalls, tokens: inTokens + outTokens };
}
