import { readFileSync } from "node:fs";
import path from "node:path";

export class AgentPromptError extends Error {}

const cache = new Map<string, string>();

/** Reads agent/prompts/<name>.md (system, morning_briefing, …). The name is a bare identifier, never a path. */
export function loadPrompt(name: string): string {
  if (!/^[a-z][a-z_]*$/.test(name)) throw new AgentPromptError(`Bad prompt name "${name}"`);
  let text = cache.get(name);
  if (text === undefined) {
    text = readFileSync(path.resolve(process.cwd(), "agent/prompts", `${name}.md`), "utf8").trim();
    cache.set(name, text);
  }
  return text;
}

/** The `{name}` variables a template uses. */
export function variablesOf(template: string): string[] {
  return [...new Set([...template.matchAll(/\{([a-z][a-z_]*)\}/g)].map((m) => m[1] as string))];
}

/**
 * Fills `{name}` placeholders in one pass, so a value that itself contains `{x}` (a dictated transcript, say) is never expanded again.
 * A variable the template needs but `vars` lacks is an error: a half-filled prompt must not reach the model.
 */
export function render(template: string, vars: Record<string, string | number>): string {
  const missing = variablesOf(template).filter((v) => vars[v] === undefined || vars[v] === "");
  if (missing.length) throw new AgentPromptError(`Missing prompt variables: ${missing.join(", ")}`);
  return template.replace(/\{([a-z][a-z_]*)\}/g, (_, v: string) => String(vars[v]));
}
