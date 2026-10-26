import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", CRON_SECRET: "cron-secret-0123456789" });
});
const ran = vi.hoisted(() => vi.fn(async (name: string) => ({ ran: name })));
vi.mock("@/server/jobs", () => ({ handlers: { "notify/deliver": async () => ({}), "calendar/poll": async () => ({}) }, run: ran }));

import { GET, POST } from "@/app/api/jobs/[name]/route";

const call = (method: "GET" | "POST", name: string, auth?: string) =>
  (method === "GET" ? GET : POST)(new NextRequest(`http://localhost/api/jobs/${name}`, { method, headers: auth ? { authorization: auth } : {} }), { params: Promise.resolve({ name }) });

describe("running jobs from a scheduler", () => {
  it("needs the secret, and says nothing about which jobs exist without it", async () => {
    expect((await call("POST", "notify~deliver")).status).toBe(401);
    expect((await call("POST", "notify~deliver", "Bearer wrong")).status).toBe(401);
    expect((await call("GET", "nothing", "Bearer nope")).status).toBe(401);
    expect(ran).not.toHaveBeenCalled();
  });

  it("runs a known job by name (slash written as ~), with GET or POST", async () => {
    const res = await call("POST", "notify~deliver", "Bearer cron-secret-0123456789");
    expect(await res.json()).toEqual({ job: "notify/deliver", result: { ran: "notify/deliver" } });
    expect((await call("GET", "calendar~poll", "Bearer cron-secret-0123456789")).status).toBe(200);
    expect(ran).toHaveBeenCalledTimes(2);
  });

  it("refuses names that are not jobs, including inherited object keys", async () => {
    for (const name of ["rm~rf", "constructor", "__proto__", "toString"]) {
      const res = await call("POST", name, "Bearer cron-secret-0123456789");
      expect(res.status, name).toBe(404);
    }
    expect(ran).not.toHaveBeenCalled();
  });
});
