import { addDays } from "./tracker";
import { zonedParts } from "@/modules/views/tz";

/** The usual times for a presentation, one press each: tonight while there is still time to prepare, tomorrow at noon and in the evening. */
export function meetingChoices(tz: string, now = new Date()): { key: "today19" | "tomorrow12" | "tomorrow19"; day: string; time: string }[] {
  const here = zonedParts(now, tz);
  const tomorrow = addDays(here.day, 1);
  return [
    ...(here.minutes < 18 * 60 ? [{ key: "today19" as const, day: here.day, time: "19:00" }] : []),
    { key: "tomorrow12" as const, day: tomorrow, time: "12:00" },
    { key: "tomorrow19" as const, day: tomorrow, time: "19:00" },
  ];
}
