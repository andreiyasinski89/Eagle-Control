import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import { endpoints } from "./endpoints";

const schema = (s: ZodTypeAny) => {
  const out = zodToJsonSchema(s, { target: "openApi3", $refStrategy: "none" }) as Record<string, unknown>;
  delete out.$schema;
  return out;
};

/** The OpenAPI 3 document, built from the same registry the dispatcher runs, so docs and behaviour cannot drift. */
export function openApiDocument(baseUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of endpoints) {
    const params: unknown[] = [...(e.path.match(/\{(\w+)\}/g) ?? []).map((n) => ({ name: n.slice(1, -1), in: "path", required: true, schema: { type: "string" } }))];
    if (e.query) {
      const q = schema(e.query) as { properties?: Record<string, unknown>; required?: string[] };
      for (const [name, s] of Object.entries(q.properties ?? {})) params.push({ name, in: "query", required: q.required?.includes(name) ?? false, schema: s });
    }
    if (e.paged) params.push({ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } }, { name: "cursor", in: "query", schema: { type: "string" }, description: "`nextCursor` of the previous page" });
    (paths[e.path] ??= {})[e.method.toLowerCase()] = {
      summary: e.summary,
      tags: [e.tag],
      security: [{ bearer: [] }],
      "x-scope": e.write ? "write" : "read",
      parameters: params,
      ...(e.body ? { requestBody: { required: true, content: { "application/json": { schema: schema(e.body) } } } } : {}),
      ...(e.method === "POST" ? { description: "Send an `Idempotency-Key` header to make retries safe (replayed for 24 hours)." } : {}),
      responses: {
        [e.method === "POST" ? "201" : "200"]: { description: e.paged ? "A page: `{ items, nextCursor, total? }`" : "`{ data }`" },
        "400": { description: "Invalid input", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        "401": { description: "Missing, expired or revoked token" },
        "402": { description: "The workspace plan does not include the API" },
        "403": { description: "Read-only token, or no permission" },
        "404": { description: "Not found in this workspace" },
        "429": { description: "Rate limited; see Retry-After" },
      },
    };
  }
  return {
    openapi: "3.0.3",
    info: { title: "MeetOwl public API", version: "1.0.0", description: "Personal access tokens (Settings → Developers) act as their owner inside one workspace. Rate limit: 600 requests per minute per token (`X-RateLimit-*`)." },
    servers: [{ url: `${baseUrl}/api/public/v1` }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "`Authorization: Bearer mo_…`" } },
      schemas: { Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } }, required: ["code", "message"] } } } },
    },
    paths,
  };
}
