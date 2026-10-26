import { ApiError } from "./errors";

/**
 * The caller's address as seen by the nearest trusted proxy. `X-Forwarded-For` is a list that every proxy appends to, so its
 * first entry is whatever the client chose to send; only the entries added by our own proxies can be believed. `hops` is how
 * many of those there are (1 behind a single load balancer or Vercel). With no header (local development) the answer is "local".
 */
export function clientIp(headers: Headers, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string {
  const list = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return "local";
  return list[Math.max(0, list.length - Math.max(1, hops))] as string;
}

export const MAX_JSON_BYTES = 1_000_000;

/** Reads a text body but refuses to buffer more than `max` bytes, whatever the client claims in Content-Length. */
export async function readText(req: Request, max = MAX_JSON_BYTES): Promise<string> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new ApiError(413, "payload_too_large", "The request body is too large");
  let text = "";
  if (req.body) {
    const reader = req.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => undefined);
        throw new ApiError(413, "payload_too_large", "The request body is too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  return text;
}

export async function readJson(req: Request, max = MAX_JSON_BYTES): Promise<unknown> {
  const text = await readText(req, max);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Body must be valid JSON");
  }
}
