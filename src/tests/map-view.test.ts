import { describe, expect, it } from "vitest";
import type { NodeStatus } from "@prisma/client";
import { initialViewport, READABLE_ZOOM, showsStatus, STATUS_TONE } from "@/modules/nodes/view";

const root = { x: 0, y: 300, width: 240, height: 76 };

describe("initial view of a map", () => {
  it("centres a small map that fits at a readable zoom", () => {
    const bounds = { x: 0, y: 0, width: 800, height: 400 };
    const v = initialViewport(bounds, { width: 1200, height: 700 }, root);
    expect(v.zoom).toBeCloseTo(1, 5); // never zoomed in past 1
    expect(v.x + (bounds.x + bounds.width / 2) * v.zoom).toBeCloseTo(600, 5);
    expect(v.y + (bounds.y + bounds.height / 2) * v.zoom).toBeCloseTo(350, 5);
  });

  it("shrinks a medium map to fit, as long as it stays readable", () => {
    const v = initialViewport({ x: 0, y: 0, width: 1500, height: 900 }, { width: 1000, height: 700 }, root);
    expect(v.zoom).toBeGreaterThanOrEqual(READABLE_ZOOM);
    expect(v.zoom).toBeLessThan(1);
  });

  it("does not shrink a big map into dots: it opens readable, with the root at the left and centred", () => {
    const bounds = { x: 0, y: 0, width: 3000, height: 4000 };
    const v = initialViewport(bounds, { width: 1000, height: 700 }, root);
    expect(v.zoom).toBe(READABLE_ZOOM);
    expect(root.x * v.zoom + v.x).toBeCloseTo(48, 5); // root 48px from the left edge
    expect((root.y + root.height / 2) * v.zoom + v.y).toBeCloseTo(350, 5); // and vertically centred
  });

  it("opens the demo-sized map (five levels, seventeen cards) at a readable zoom on a laptop screen", () => {
    const bounds = { x: 0, y: 0, width: 5 * 310, height: 17 * 94 };
    expect(initialViewport(bounds, { width: 900, height: 600 }, root).zoom).toBeGreaterThanOrEqual(READABLE_ZOOM);
  });
});

describe("status on a card", () => {
  it("has a tone for every status", () => {
    const all: NodeStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];
    for (const s of all) expect(STATUS_TONE[s]).toBeTruthy();
    expect(STATUS_TONE.IN_PROGRESS).toBe("active");
    expect(STATUS_TONE.DONE).toBe("done");
  });

  it("shows a status only on tasks and subtasks", () => {
    expect(["TASK", "SUBTASK"].every(showsStatus)).toBe(true);
    expect(["PROJECT", "EPIC", "SPRINT", "DOCUMENT", "EVENT", "DEAL"].some(showsStatus)).toBe(false);
  });
});
