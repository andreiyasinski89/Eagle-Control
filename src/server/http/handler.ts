import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z, type ZodTypeAny } from "zod";
import { auth } from "@/server/auth";
import { ApiError, unauthorized } from "./errors";
import { clientIp, readJson } from "./limits";
import { rateLimit } from "./rate-limit";

interface Options {
  /** Require a signed-in user (default true). */
  auth?: boolean;
  rateLimit?: { limit: number; windowMs: number };
}

interface Args<P> {
  req: NextRequest;
  params: P;
  userId: string | null;
}

type RouteContext<P> = { params: Promise<P> };

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function parseBody<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.output<S>> {
  return schema.parse(await readJson(req));
}

export function route<P extends Record<string, string> = Record<string, never>>(
  opts: Options,
  fn: (args: Args<P>) => Promise<NextResponse | object | null>,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<NextResponse> => {
    try {
      if (opts.rateLimit) {
        const ip = clientIp(req.headers);
        const key = `${req.method}:${req.nextUrl.pathname}:${ip}`;
        if (!rateLimit(key, opts.rateLimit.limit, opts.rateLimit.windowMs)) {
          throw new ApiError(429, "rate_limited", "Too many requests");
        }
      }
      let userId: string | null = null;
      if (opts.auth !== false) {
        const session = await auth();
        userId = session?.user?.id ?? null;
        if (!userId) throw unauthorized();
      }
      const params = await ctx.params;
      const result = await fn({ req, params, userId });
      if (result instanceof NextResponse) return result;
      return result === null ? new NextResponse(null, { status: 204 }) : json(result);
    } catch (err) {
      if (err instanceof ApiError) {
        return json({ error: { code: err.code, message: err.message, ...err.details } }, err.status);
      }
      if (err instanceof ZodError) {
        return json({ error: { code: "validation", message: "Invalid input", issues: err.issues } }, 400);
      }
      console.error(err);
      return json({ error: { code: "internal", message: "Internal error" } }, 500);
    }
  };
}
