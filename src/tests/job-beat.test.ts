import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * On the free Neon plan the database sleeps after 5 idle minutes and the time it is awake is the monthly quota. Jobs on their own beats
 * (every 5, every 10 minutes, at minute 20…) keep it awake all month; so everything that runs more than once an hour shares one beat.
 */
const BEAT_MINUTES = ["*/15", "*/30", "0"];

function schedules(): { where: string; cron: string }[] {
  const out: { where: string; cron: string }[] = [];
  const inngest = readFileSync(join(process.cwd(), "src", "server", "jobs", "inngest.ts"), "utf8");
  for (const m of inngest.matchAll(/job\("([^"]+)",\s*\{[^}]*cron:\s*"([^"]+)"/g)) out.push({ where: `inngest ${m[1]}`, cron: m[2] as string });
  const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
  for (const c of vercel.crons) out.push({ where: `vercel ${c.path}`, cron: c.schedule });
  return out;
}

describe("background job beat", () => {
  it("finds the schedules", () => expect(schedules().length).toBeGreaterThan(15));

  it("keeps every job that runs more than once a day on the shared quarter-hour beat", () => {
    const off = schedules().filter(({ cron }) => {
      const [minute, hour] = cron.split(" ") as [string, string];
      return hour === "*" && !BEAT_MINUTES.includes(minute); // runs every hour or more often, but not on the beat
    });
    expect(off, `off the beat: ${off.map((o) => `${o.where} (${o.cron})`).join(", ")}`).toEqual([]);
  });

  it("never runs anything every 5 or 10 minutes", () => {
    const busy = schedules().filter(({ cron }) => /^\*\/(1|2|3|5|10)\s/.test(cron));
    expect(busy, `too frequent: ${busy.map((o) => o.where).join(", ")}`).toEqual([]);
  });
});
