import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain function throws when there is "no request"; Vitest would count an error thrown inside a vi.fn as a failed test even when it is caught.
const hoisted = vi.hoisted(() => ({ after: vi.fn(), inRequest: true }));
vi.mock("next/server", () => ({
  after: (work: () => Promise<unknown>) => {
    if (!hoisted.inRequest) throw new Error("`after` was called outside a request scope");
    hoisted.after(work);
  },
}));

import { afterResponse } from "@/server/jobs/after-response";

describe("afterResponse", () => {
  beforeEach(() => {
    hoisted.after.mockReset();
    hoisted.inRequest = true;
  });

  it("hands the work to Next's `after`, so the host keeps it alive after the answer has gone", () => {
    const work = vi.fn(async () => undefined);
    afterResponse(work);
    expect(hoisted.after).toHaveBeenCalledTimes(1);
    expect(hoisted.after).toHaveBeenCalledWith(work);
    expect(work).not.toHaveBeenCalled(); // `after` is the one that runs it
  });

  it("starts the work right away where there is no request (scripts, tests)", () => {
    hoisted.inRequest = false;
    const work = vi.fn(async () => undefined);
    afterResponse(work);
    expect(work).toHaveBeenCalledTimes(1);
    expect(hoisted.after).not.toHaveBeenCalled();
  });
});

describe("Google Calendar poll schedule", () => {
  it("runs on Vercel Cron too, not only on Inngest: it is what catches up meetings that did not reach Google", () => {
    const { crons } = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    const poll = crons.find((c) => c.path === "/api/jobs/calendar~poll");
    expect(poll, "calendar~poll missing from vercel.json").toBeTruthy();
    expect(poll?.schedule).toMatch(/^\*\/(1|2|3|5|10|15) \* \* \* \*$/); // at least every quarter of an hour
  });
});
