import { env } from "@/lib/env";
import { ApiError } from "@/server/http/errors";
import { httpJson, IntegrationError } from "@/server/integrations/common";

export interface AiRequest {
  /** Names the feature; the mock provider keys its canned answers on it. */
  feature: string;
  system: string;
  user: string;
  maxTokens: number;
}

export interface AiResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AiProvider {
  complete(req: AiRequest): Promise<AiResult>;
}

/** Claude through the Messages API. The key never leaves the server. */
export const anthropic: AiProvider = {
  async complete(req) {
    const key = env().ANTHROPIC_API_KEY;
    const model = env().AI_MODEL;
    try {
      const res = await httpJson<{ content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } }>("anthropic", "https://api.anthropic.com/v1/messages", {
        method: "POST",
        timeoutMs: 60_000,
        headers: { "x-api-key": key as string, "anthropic-version": "2023-06-01" },
        json: { model, max_tokens: req.maxTokens, system: req.system, messages: [{ role: "user", content: req.user }] },
      });
      const text = (res.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
      if (!text) throw new ApiError(502, "ai_empty", "The AI returned no text. Try again.");
      return { text, inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0, model };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // Overload, rate limits and timeouts are the provider's business; the caller just retries later.
      if (e instanceof IntegrationError) throw new ApiError(503, "ai_unavailable", "The AI service is busy or unavailable. Try again in a moment.");
      throw e;
    }
  },
};

/** Canned answers for development without a key and for tests that must not call out. Deterministic. */
export const mock: AiProvider = {
  async complete(req) {
    const q = /<question>([\s\S]*?)<\/question>/.exec(req.user)?.[1]?.trim() ?? "";
    const lines = req.user.split("\n").length;
    const text =
      req.feature === "breakdown"
        ? JSON.stringify({ subtasks: [{ title: "Clarify the requirements", estimation: 2 }, { title: "Implement the first version", estimation: 8 }, { title: "Review and polish", estimation: 3 }] })
        : req.feature === "lead_reply"
          ? "Hi,\n\nThank you for your interest. I would be glad to walk you through the next steps. Could we speak this week?\n\nBest regards"
          : req.feature === "ask"
            ? `(sample answer) You asked: ${q}`
            : `(sample ${req.feature === "client_report" ? "client report" : "summary"}) The project context had ${lines} lines.`;
    return { text, inputTokens: Math.ceil((req.system.length + req.user.length) / 4), outputTokens: Math.ceil(text.length / 4), model: "mock" };
  },
};

/** Which provider runs: the real one with a key, canned answers in development without one, never in production without a key. */
export function provider(): AiProvider {
  const e = env();
  const chosen = e.AI_PROVIDER ?? (e.ANTHROPIC_API_KEY ? "anthropic" : process.env.NODE_ENV === "production" ? null : "mock");
  if (chosen === "anthropic" && e.ANTHROPIC_API_KEY) return anthropic;
  if (chosen === "mock") return mock;
  throw new ApiError(501, "not_configured", "AI is not configured on this server");
}
