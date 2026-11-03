import { env } from "@/lib/env";
import { ApiError } from "@/server/http/errors";
import { httpJson, IntegrationError } from "@/server/integrations/common";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface Msg {
  role: "user" | "assistant";
  content: string | Block[];
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ModelRequest {
  system: string;
  messages: Msg[];
  tools: ToolDef[];
  maxTokens: number;
}

export interface ModelReply {
  content: Block[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/** The seam between the agent loop and the LLM: the real one is the Messages API, tests pass a scripted one. */
export interface AgentModel {
  complete(req: ModelRequest): Promise<ModelReply>;
}

/** Claude through the Messages API with tool use. The key comes from the environment only. */
export const anthropicModel: AgentModel = {
  async complete(req) {
    const key = env().ANTHROPIC_API_KEY;
    if (!key) throw new ApiError(501, "not_configured", "AI is not configured on this server (ANTHROPIC_API_KEY)");
    const model = env().AI_MODEL;
    try {
      const res = await httpJson<{ content?: Block[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } }>("anthropic", "https://api.anthropic.com/v1/messages", {
        method: "POST",
        timeoutMs: 120_000,
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        json: { model, max_tokens: req.maxTokens, system: req.system, messages: req.messages, ...(req.tools.length > 0 ? { tools: req.tools } : {}) },
      });
      return { content: res.content ?? [], stopReason: res.stop_reason ?? "end_turn", inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0, model };
    } catch (e) {
      // The provider's own reason (a key it refuses, no credit left, a model it does not know) is what the person has to act on; it holds no secret.
      if (e instanceof IntegrationError) throw new ApiError(503, "ai_unavailable", `The AI service did not accept the request: ${e.message.replace(/^anthropic:s*/, "").slice(0, 300)}`);
      throw e;
    }
  },
};
