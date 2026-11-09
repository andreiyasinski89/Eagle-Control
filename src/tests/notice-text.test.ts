import { describe, expect, it } from "vitest";
import { noticeText } from "@/server/services/notice-text";

describe("notifications in the reader's language", () => {
  it("writes the title and body in the recipient's language, with the values put in", () => {
    expect(noticeText("ru", { key: "projectRed", params: { title: "Разработка" } })).toEqual({ title: "Проект «Разработка» стал красным", body: null });
    expect(noticeText("ru", { key: "sprintEnded", params: { sprint: "Неделя 1", done: 0, total: 7 } })).toEqual({ title: "Спринт завершён: Неделя 1", body: "Выполнено задач: 0 из 7" });
    expect(noticeText("uk", { key: "inviteJoined", params: { name: "Оксана" } })?.title).toBe("Оксана приєднався(-лася) до MLM CRM за вашим посиланням");
  });
  it("counts in each language's own way", () => {
    expect(noticeText("ru", { key: "assignedMany", params: { n: 1 } })?.title).toBe("Вам назначена 1 задача");
    expect(noticeText("ru", { key: "assignedMany", params: { n: 3 } })?.title).toBe("Вам назначены 3 задачи");
    expect(noticeText("ru", { key: "assignedMany", params: { n: 5 } })?.title).toBe("Вам назначено 5 задач");
    expect(noticeText("en", { key: "assignedMany", params: { n: 2 } })?.title).toBe("You were assigned 2 tasks");
  });
  it("an unknown language reads English; an unknown key gives nothing (the English fallback stays)", () => {
    expect(noticeText("de", { key: "reminder", params: { title: "X" } })?.title).toBe("Reminder: X");
    expect(noticeText("ru", { key: "noSuchNotice" })).toBeNull();
  });
});
