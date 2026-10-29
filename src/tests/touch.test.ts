import { describe, expect, it } from "vitest";
import { cleanTouchSettings, DEFAULT_TOUCH_SETTINGS, orderQueue, planTouch, situationFor, type QueueItem, type TouchSettings } from "@/modules/crm/touch";
import { fillScript } from "@/modules/crm/tracker";

const item = (id: string, over: Partial<QueueItem> = {}): QueueItem => ({ id, name: id, stage: "FIRST_CONTACT", temperature: "COLD", day: "2026-11-10", overdue: false, ...over });
const ids = (list: QueueItem[]) => orderQueue(list).map((i) => i.id);
const TODAY = "2026-11-10";
const plan = (over: Partial<Parameters<typeof planTouch>[0]> & { outcome: Parameters<typeof planTouch>[0]["outcome"] }) => planTouch({ stage: "FIRST_CONTACT", today: TODAY, settings: DEFAULT_TOUCH_SETTINGS, locale: "ru", ...over });

describe("the order of the queue", () => {
  it("late ones first, then the hottest, then those closest to a decision", () => {
    expect(ids([item("cold"), item("hot", { temperature: "HOT" }), item("late-cold", { overdue: true }), item("warm", { temperature: "WARM" })])).toEqual(["late-cold", "hot", "warm", "cold"]);
    expect(ids([item("new", { stage: "NEW" }), item("deciding", { stage: "DECIDING" }), item("presenting", { stage: "PRESENTATION" }), item("warming", { stage: "WARMING" })])).toEqual(["deciding", "presenting", "warming", "new"]);
  });

  it("among the late ones the hottest still go first, and then the oldest date, then the name", () => {
    expect(ids([item("late-cold", { overdue: true }), item("late-hot", { overdue: true, temperature: "HOT" })])).toEqual(["late-hot", "late-cold"]);
    expect(ids([item("b", { day: "2026-11-10" }), item("a", { day: "2026-11-10" }), item("old", { day: "2026-11-01" })])).toEqual(["old", "a", "b"]);
  });

  it("people with no temperature or no stage in the list come last of their kind, and the original list is not changed", () => {
    const list = [item("none", { temperature: null }), item("cold")];
    expect(ids(list)).toEqual(["cold", "none"]);
    expect(list.map((i) => i.id)).toEqual(["none", "cold"]);
  });
});

describe("what a result does to the next step", () => {
  it("an answer: the next touch tomorrow, and a new name becomes a first contact", () => {
    expect(plan({ outcome: "REPLIED" })).toMatchObject({ nextStep: "Продолжить разговор: человек ответил", day: "2026-11-11", cooled: false });
    expect(plan({ outcome: "REPLIED", stage: "NEW" }).stage).toBe("FIRST_CONTACT");
    expect(plan({ outcome: "REPLIED", stage: "WARMING" }).stage).toBeUndefined();
  });

  it("no answer: the next touch in 3 days by default, in 2 if the person chose so", () => {
    expect(plan({ outcome: "NO_REPLY", unansweredInRow: 1 })).toMatchObject({ day: "2026-11-13", cooled: false });
    expect(plan({ outcome: "NO_REPLY", unansweredInRow: 2, settings: { ...DEFAULT_TOUCH_SETTINGS, noReplyDays: 2 } })).toMatchObject({ day: "2026-11-12", cooled: false });
  });

  it("the third touch in a row without an answer: the person goes quiet and comes back in 30 days", () => {
    const r = plan({ outcome: "NO_REPLY", unansweredInRow: 3, stage: "WARMING" });
    expect(r).toMatchObject({ stage: "NO_REPLY", cooled: true, day: "2026-12-10", returnAt: "2026-12-10", nextStep: "Вернуться к человеку после паузы" });
    expect(plan({ outcome: "NO_REPLY", unansweredInRow: 5 }).cooled).toBe(true);
  });

  it("a meeting set: the day of the meeting is the next step, and the person moves on to the presentation stage unless the rule is off", () => {
    expect(plan({ outcome: "MEETING_SET", meetingDay: "2026-11-15" })).toMatchObject({ stage: "PRESENTATION", day: "2026-11-15", nextStep: "Встреча 15.11: провести разговор" });
    expect(plan({ outcome: "MEETING_SET", meetingDay: "2026-11-15", settings: { ...DEFAULT_TOUCH_SETTINGS, meetingMovesStage: false } }).stage).toBeUndefined();
    expect(plan({ outcome: "MEETING_SET", meetingDay: "2026-11-15", stage: "DECIDING" }).stage).toBeUndefined(); // already past it
    expect(plan({ outcome: "MEETING_SET", meetingDay: "2026-11-15", stage: "NEW", settings: { ...DEFAULT_TOUCH_SETTINGS, meetingMovesStage: false } }).stage).toBe("FIRST_CONTACT");
  });

  it("a no: out of the queue for 75 days by default, anywhere from 60 to 90 by the person's choice", () => {
    expect(plan({ outcome: "DECLINED" })).toMatchObject({ stage: "DECLINED", returnAt: "2027-01-24", day: "2027-01-24" });
    expect(plan({ outcome: "DECLINED", settings: { ...DEFAULT_TOUCH_SETTINGS, declineDays: 60 } }).day).toBe("2027-01-09");
  });

  it("someone who was quiet or said no and answers is back in the funnel", () => {
    expect(plan({ outcome: "REPLIED", stage: "NO_REPLY" }).stage).toBe("FIRST_CONTACT");
    expect(plan({ outcome: "REPLIED", stage: "DECLINED" }).stage).toBe("FIRST_CONTACT");
    expect(plan({ outcome: "MEETING_SET", stage: "DECLINED", meetingDay: "2026-11-15" }).stage).toBe("PRESENTATION");
  });

  it("the next step is written in the language of the person", () => {
    expect(plan({ outcome: "REPLIED", locale: "en" }).nextStep).toBe("Continue the conversation: they replied");
    expect(plan({ outcome: "REPLIED", locale: "pl" }).nextStep).toBe("Kontynuować rozmowę: odpowiedział(a)");
    expect(plan({ outcome: "REPLIED", locale: "uk" }).nextStep).toContain("відповіла");
    expect(plan({ outcome: "REPLIED", locale: "de" }).nextStep).toBe("Continue the conversation: they replied");
    expect(plan({ outcome: "MEETING_SET", locale: "en", meetingDay: "2026-11-15" }).nextStep).toBe("Meeting on 15.11: have the talk");
  });
});

describe("the settings of the queue", () => {
  it("keep what is allowed and put the rest back in range", () => {
    expect(cleanTouchSettings(undefined)).toEqual(DEFAULT_TOUCH_SETTINGS);
    const s: TouchSettings = cleanTouchSettings({ replyDays: 10, noReplyDays: 1, declineDays: 400, meetingMovesStage: false, coolAfter: 1, coolDays: 1 });
    expect(s).toEqual({ replyDays: 3, noReplyDays: 2, coolAfter: 3, coolDays: 30, declineDays: 90, meetingMovesStage: false });
    expect(cleanTouchSettings({ declineDays: 10 }).declineDays).toBe(60);
    expect(cleanTouchSettings({ replyDays: "x", meetingMovesStage: "yes" })).toEqual(DEFAULT_TOUCH_SETTINGS);
  });
});

describe("which script is for which moment", () => {
  it("a new name gets a first touch, silence a reminder, a presentation its follow-up, a quiet person a return", () => {
    expect(situationFor({ stage: "NEW", lastOutcome: null, meetingHeld: false })).toBe("FIRST_TOUCH");
    expect(situationFor({ stage: "WARMING", lastOutcome: "NO_REPLY", meetingHeld: false })).toBe("REMINDER");
    expect(situationFor({ stage: "PRESENTATION", lastOutcome: null, meetingHeld: false })).toBe("AFTER_PRESENTATION");
    expect(situationFor({ stage: "WARMING", lastOutcome: "REPLIED", meetingHeld: true })).toBe("AFTER_PRESENTATION");
    expect(situationFor({ stage: "NO_REPLY", lastOutcome: "NO_REPLY", meetingHeld: false })).toBe("RETURN");
    expect(situationFor({ stage: "DECLINED", lastOutcome: "DECLINED", meetingHeld: false })).toBe("RETURN");
    expect(situationFor({ stage: "FIRST_CONTACT", lastOutcome: "REPLIED", meetingHeld: false })).toBe("REMINDER");
  });
});

describe("the details put into a script", () => {
  const v = { name: "Анна", fullName: "Анна Ковальская", myName: "Андрей", city: "Варшава", link: "https://meetowl.ai/r/abc" };
  it("fills the names in Latin and in Russian, and the city and the personal link", () => {
    expect(fillScript("Привет, {имя}! Это {моё_имя}. Как в {город}? {link}", v)).toBe("Привет, Анна! Это Андрей. Как в Варшава? https://meetowl.ai/r/abc");
    expect(fillScript("{name} / {full_name} / {my_name} / {city} / {личная_ссылка}", v)).toBe("Анна / Анна Ковальская / Андрей / Варшава / https://meetowl.ai/r/abc");
  });
  it("leaves a city or a link that is not known as it is, so it can be filled by hand; unknown words are not touched", () => {
    expect(fillScript("Из {город}? Вот ссылка: {личная_ссылка}. {что-то}", { name: "A", fullName: "A", myName: "B" })).toBe("Из {город}? Вот ссылка: {личная_ссылка}. {что-то}");
  });
});
