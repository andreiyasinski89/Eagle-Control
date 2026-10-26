export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

export const unauthorized = () => new ApiError(401, "unauthorized", "Sign in required");
export const forbidden = () => new ApiError(403, "forbidden", "Not allowed");
export const notFound = (what = "resource") => new ApiError(404, "not_found", `${what} not found`);
export const conflict = (code: string, message?: string) => new ApiError(409, code, message);
export const limitReached = (limit: number, key: string) =>
  new ApiError(402, "plan_limit", `Plan limit reached for ${key}`, { limit, key });
