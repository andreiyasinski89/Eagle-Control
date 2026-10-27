import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OUTLINE_LIMITS, parseTaskOutline } from "@/modules/nodes/task-outline";

const titles = (text: string) => parseTaskOutline(text).tasks.map((t) => [t.title, ...t.subtasks.map((s) => `  ${s}`)]).flat();

describe("a list of tasks typed as lines", () => {
  it("makes one task per plain line", () => {
    expect(parseTaskOutline("Write the brief\nBook the venue\n\n  \nCall Anna").tasks.map((t) => t.title)).toEqual(["Write the brief", "Book the venue", "Call Anna"]);
  });

  it("an indented line is a subtask of the task above, however it is indented", () => {
    expect(titles("Launch\n  Announce\n  Venue\nWebsite\n    Links")).toEqual(["Launch", "  Announce", "  Venue", "Website", "  Links"]);
    expect(titles("Launch\n\tAnnounce\n\tVenue")).toEqual(["Launch", "  Announce", "  Venue"]);
  });

  it("with no indents, dashes under a plain line are subtasks", () => {
    expect(titles("Launch\n- Announce\n- Venue\nWebsite\n* Links")).toEqual(["Launch", "  Announce", "  Venue", "Website", "  Links"]);
  });

  it("a list in which every line has a dash, or a number, is a plain list of tasks, not one task with subtasks", () => {
    expect(titles("- One\n- Two\n- Three")).toEqual(["One", "Two", "Three"]);
    expect(titles("1. One\n2) Two\n3. Three")).toEqual(["One", "Two", "Three"]);
  });

  it("markers are decoration: dashes and numbers are stripped, also on indented lines", () => {
    expect(titles("1. Launch\n   - Announce\n   - Venue")).toEqual(["Launch", "  Announce", "  Venue"]);
    expect(titles("•  Bullet task")).toEqual(["Bullet task"]);
  });

  it("deeper levels are subtasks of the same task: a subtask has no children", () => {
    expect(titles("A\n  B\n    C\n      D")).toEqual(["A", "  B", "  C", "  D"]);
  });

  it("an indented first line has no task above it, so it becomes a task", () => {
    expect(titles("  Alone\n  Next")).toEqual(["Alone", "Next"]);
  });

  it("counts, handles Windows line breaks, and trims long titles", () => {
    const r = parseTaskOutline("A\r\n  B\r\n  C\r\nD");
    expect(r.count).toEqual({ tasks: 2, subtasks: 2 });
    expect(parseTaskOutline("x".repeat(500)).tasks[0]?.title).toHaveLength(OUTLINE_LIMITS.title);
    expect(parseTaskOutline("").count).toEqual({ tasks: 0, subtasks: 0 });
    expect(parseTaskOutline("   \n\n- \n").tasks).toEqual([]);
  });

  it("stops at the limits and says so", () => {
    const many = Array.from({ length: 60 }, (_, i) => `Task ${i}`).join("\n");
    const r = parseTaskOutline(many);
    expect(r.count.tasks).toBe(OUTLINE_LIMITS.tasks);
    expect(r.truncated).toBe(true);
    const wide = ["Big", ...Array.from({ length: 50 }, (_, i) => `  Small ${i}`)].join("\n");
    expect(parseTaskOutline(wide).count).toEqual({ tasks: 1, subtasks: OUTLINE_LIMITS.subtasksPerTask });
    expect(parseTaskOutline("fits\n  fine").truncated).toBe(false);
  });
});

describe("the icons of the site", () => {
  const root = process.cwd();
  it("has a favicon, an svg icon, an apple icon and a home-screen manifest", () => {
    for (const f of ["src/app/favicon.ico", "src/app/icon.svg", "src/app/apple-icon.png", "src/app/manifest.ts", "public/icons/icon-192.png", "public/icons/icon-512.png"]) expect(existsSync(join(root, f)), f).toBe(true);
  });
  it("the files are what their names say", () => {
    const ico = readFileSync(join(root, "src/app/favicon.ico"));
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]); // an icon holding 16, 32 and 48 px
    for (const f of ["src/app/apple-icon.png", "public/icons/icon-192.png", "public/icons/icon-512.png"]) expect(readFileSync(join(root, f)).subarray(0, 8).toString("hex"), f).toBe("89504e470d0a1a0a");
    expect(readFileSync(join(root, "src/app/icon.svg"), "utf8")).toMatch(/^<svg[^>]+viewBox="0 0 64 64"/);
  });
  it("the png sizes are 180, 192 and 512", () => {
    const size = (f: string) => {
      const b = readFileSync(join(root, f));
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    };
    expect(size("src/app/apple-icon.png")).toEqual([180, 180]);
    expect(size("public/icons/icon-192.png")).toEqual([192, 192]);
    expect(size("public/icons/icon-512.png")).toEqual([512, 512]);
  });
});
