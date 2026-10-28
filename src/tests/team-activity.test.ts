import { describe, expect, it } from "vitest";
import { activityStatus, countWork, firstLineIds, latest } from "@/modules/crm/team-activity";

const now = new Date("2026-11-10T12:00:00.000Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe("team activity", () => {
  it("is active for 3 days, quiet up to 7, then long gone; never when there is no sign", () => {
    expect(activityStatus(ago(0), now)).toBe("active");
    expect(activityStatus(ago(2.9), now)).toBe("active");
    expect(activityStatus(ago(3), now)).toBe("quiet");
    expect(activityStatus(ago(6.9), now)).toBe("quiet");
    expect(activityStatus(ago(7), now)).toBe("gone");
    expect(activityStatus(null, now)).toBe("never");
    expect(activityStatus(ago(4), now, 5, 10)).toBe("active"); // the limits can be set
  });

  it("counts each move into a stage, calls and meetings, and finished tasks", () => {
    const c = countWork(
      [{ fromStage: null, toStage: "NEW" }, { fromStage: "NEW", toStage: "FIRST_CONTACT" }, { fromStage: "FIRST_CONTACT", toStage: "PRESENTATION" }, { fromStage: "DECIDING", toStage: "CLIENT" }, { fromStage: "DECIDING", toStage: "PARTNER" }],
      [{ type: "CALL" }, { type: "MEETING" }, { type: "TASK" }, { type: "NOTE" }, { type: "EMAIL" }],
    );
    expect(c).toMatchObject({ added: 1, contacted: 1, presentations: 1, clients: 1, partners: 1, meetings: 2, tasks: 1 });
  });

  it("takes the latest moment and ignores the missing ones", () => {
    expect(latest(ago(5), null, ago(2), undefined)).toEqual(ago(2));
    expect(latest(null, undefined)).toBeNull();
  });

  it("the first line: partners with no partner above, passing over people who are not partners, never counting yourself", () => {
    const people = [
      { id: "me", stage: "PARTNER", sponsorId: null },
      { id: "a", stage: "PARTNER", sponsorId: "me" },
      { id: "b", stage: "PARTNER", sponsorId: "a" },
      { id: "x", stage: "NEW", sponsorId: "a" },
      { id: "c", stage: "PARTNER", sponsorId: "x" }, // sponsored through a non-partner: still under "a"
      { id: "d", stage: "PARTNER", sponsorId: null },
      { id: "e", stage: "PARTNER", sponsorId: "gone" }, // sponsor not in the list
    ];
    expect(firstLineIds(people, "me").sort()).toEqual(["a", "d", "e"]);
    expect(firstLineIds([{ id: "l1", stage: "PARTNER", sponsorId: "l2" }, { id: "l2", stage: "PARTNER", sponsorId: "l1" }], null)).toEqual([]);
  });
});
