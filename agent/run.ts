import { db } from "@/server/db";
import { ApiError, forbidden } from "@/server/http/errors";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { anthropicModel, type AgentModel, type Block, type Msg } from "./model";
import { promptsFor, type AgentRole } from "./roles";
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

  const { system, user } = promptsFor(opts.role, opts.vars);
  const model = opts.model ?? anthropicModel;
  const ctx: AgentContext = { userId: opts.userId, workspaceId: opts.workspaceId, seen: new Set() };
  const tools = toolDefs();
  const messages: Msg[] = [{ role: "user", content: user }];
  const toolCalls: ToolCallLog[] = [];
  let inTokens = 0;
  let outTokens = 0;
  let modelName = "unknown";
  let output = "";

  const save = async (text: string) => {
    const run = await db.agentRun.create({
      data: { workspaceId: opts.workspaceId, userId: opts.userId, role: opts.role, input: user, output: text, toolCalls: toolCalls as never, tokens: inTokens + outTokens },
    });
    // Counts toward the workspace's monthly AI allowance, like every other AI feature.
    if (inTokens + outTokens > 0) await db.aiUsage.create({ data: { workspaceId: opts.workspaceId, userId: opts.userId, feature: `agent:${opts.role}`, model: modelName, inputTokens: inTokens, outputTokens: outTokens } });
    return run.id;
  };

  try {
    for (let turn = 0; turn < (opts.maxTurns ?? MAX_TURNS); turn++) {
      const reply = await model.complete({ system, messages, tools, maxTokens: MAX_TOKENS });
      inTokens += reply.inputTokens;
      outTokens += reply.outputTokens;
      modelName = reply.model;
      messages.push({ role: "assistant", content: reply.content });
      const text = reply.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("").trim();
      const uses = reply.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
      if (text) output = text;
      if (reply.stopReason !== "tool_use" || uses.length === 0) break;

      const results: Block[] = [];
      for (const use of uses) {
        const started = Date.now();
        const r = await callTool(ctx, use.name, use.input);
        toolCalls.push({ name: use.name, input: use.input, output: clip(r.output, LOG_LIMIT), isError: r.isError, ms: Date.now() - started });
        results.push({ type: "tool_result", tool_use_id: use.id, content: r.output, is_error: r.isError });
      }
      messages.push({ role: "user", content: results });
    }
    if (!output) throw new ApiError(502, "agent_empty", "The agent finished without an answer. Try again.");
  } catch (e) {
    await save(`[error] ${e instanceof Error ? e.message : "failed"}`);
    throw e;
  }
  const id = await save(output);
  return { id, output, toolCalls, tokens: inTokens + outTokens };
}
