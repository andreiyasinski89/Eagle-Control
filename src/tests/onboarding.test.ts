import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dreamDistance, evaluate, STEPS, stepHref, type Facts } from "@/modules/onboarding/steps";

const none: Facts = { timezoneSet: false, tasksCreated: 0, timeEntries: 0, notes: 0, hasDream: false, people: 0, peopleMoved: 0, nextSteps: 0, scripts: 0, rules: 0, weekGoals: false, stepsClosed: 0, groups: 0, partners: 0, invited: 0 };

describe("the onboarding steps", () => {
  it("starts with the platform in a short block, then the work with people", () => {
    const ids = STEPS.map((s) => s.id);
    expect(ids.slice(0, 4)).toEqual(["profile", "firstTask", "timer", "notes"]);
    expect(STEPS.filter((s) => s.block === "platform")).toHaveLength(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("nothing done: every step to do, the first required one is next", () => {
    const e = evaluate(none, [], { crm: true });
    expect(e.steps.every((s) => s.status === "todo")).toBe(true);
    expect(e).toMatchObject({ required: 11, done: 0, percent: 0, next: "profile" });
  });

  it("reads what is done from the data, with counts for the steps that are counts", () => {
    const e = evaluate({ ...none, timezoneSet: true, tasksCreated: 3, people: 40, peopleMoved: 2, nextSteps: 5 }, [], { crm: true });
    const by = Object.fromEntries(e.steps.map((s) => [s.id, s]));
    expect(by.profile?.status).toBe("done");
    expect(by.firstTask?.status).toBe("done");
    expect(by.list).toMatchObject({ status: "done", progress: { value: 40, goal: 100 } });
    expect(by.funnel).toMatchObject({ status: "todo", progress: { value: 2, goal: 5 } });
    expect(by.nextSteps?.status).toBe("done");
    expect(e).toMatchObject({ done: 4, next: "timer" });
  });

  it("scripts need both a script and an auto-plan; a week's targets are a yes or no", () => {
    expect(evaluate({ ...none, scripts: 1 }, [], { crm: true }).steps.find((s) => s.id === "scripts")?.status).toBe("todo");
    expect(evaluate({ ...none, scripts: 1, rules: 2 }, [], { crm: true }).steps.find((s) => s.id === "scripts")?.status).toBe("done");
  });

  it("a skipped step does not hold the progress back, and a done step stays done even if skipped", () => {
    const e = evaluate({ ...none, notes: 1 }, ["profile", "notes"], { crm: true });
    expect(e.steps.find((s) => s.id === "profile")?.status).toBe("skipped");
    expect(e.steps.find((s) => s.id === "notes")?.status).toBe("done");
    expect(e).toMatchObject({ required: 10, done: 1, next: "firstTask" });
  });

  it("optional steps never count against the person", () => {
    const e = evaluate(none, [], { crm: true });
    expect(e.steps.filter((s) => s.optional).map((s) => s.id)).toEqual(["groups", "partners", "invite"]);
    const all = evaluate({ timezoneSet: true, tasksCreated: 1, timeEntries: 1, notes: 1, hasDream: true, people: 30, peopleMoved: 5, nextSteps: 5, scripts: 1, rules: 1, weekGoals: true, stepsClosed: 3, groups: 0, partners: 0, invited: 0 }, [], { crm: true });
    expect(all).toMatchObject({ percent: 100, next: null });
  });

  it("without the CRM only the steps of the platform and the dream remain", () => {
    const e = evaluate(none, [], { crm: false });
    expect(e.steps.map((s) => s.id)).toEqual(["profile", "firstTask", "timer", "notes", "dream"]);
    expect(e.required).toBe(5);
  });
});

describe("the distance to the dream", () => {
  it("counts what is won against the targets and the days left", () => {
    const d = dreamDistance({ targetClients: 20, targetPartners: 5, targetDate: "2027-01-01" }, { clients: 4, partners: 1 }, "2026-10-27");
    expect(d.clients).toEqual({ have: 4, target: 20, left: 16 });
    expect(d.partners).toEqual({ have: 1, target: 5, left: 4 });
    expect(d.daysLeft).toBe(66);
    expect(d.percent).toBe(20);
    expect(d.perWeek).toEqual({ clients: 1.7, partners: 0.4 });
  });
  it("more than the target is no more than complete", () => {
    const d = dreamDistance({ targetClients: 2, targetPartners: null, targetDate: null }, { clients: 9, partners: 3 }, "2026-10-27");
    expect(d).toMatchObject({ percent: 100, partners: null, daysLeft: null, perWeek: null });
    expect(d.clients).toEqual({ have: 9, target: 2, left: 0 });
  });
  it("a date that has passed is negative and gives no pace", () => {
    const d = dreamDistance({ targetClients: 10, targetPartners: 0, targetDate: "2026-10-20" }, { clients: 1, partners: 0 }, "2026-10-27");
    expect(d.daysLeft).toBe(-7);
    expect(d.perWeek).toBeNull();
    expect(d.partners).toBeNull();
  });
  it("no targets: no percent", () => {
    expect(dreamDistance({ targetClients: null, targetPartners: null, targetDate: "2027-01-01" }, { clients: 1, partners: 1 }, "2026-10-27").percent).toBeNull();
  });
});

describe("where the buttons lead", () => {
  // A 404 on "Open" once reached a user: the profile step pointed at /settings, which has no page of its own.
  const exists = (path: string) => existsSync(path);
  it("every step opens a page that exists, and the card on the home page uses the same address", () => {
    for (const s of STEPS) {
      const href = stepHref("demo", s.path);
      const dir = href.startsWith("/account") ? "src/app/[locale]/account" : `src/app/[locale]/w/[slug]${href.replace("/w/demo", "")}`;
      expect(exists(`${dir}/page.tsx`), `${s.id} → ${href}`).toBe(true);
    }
  });
  it("sends the profile step to the account page, outside the workspace", () => {
    expect(stepHref("acme", "/account")).toBe("/account");
    expect(stepHref("acme", "/tasks")).toBe("/w/acme/tasks");
  });
});
