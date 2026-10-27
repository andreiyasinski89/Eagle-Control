import { describe, expect, it } from "vitest";
import { MAX_PEOPLE_AT_ONCE, parseInfluence, parseInterests, parseLooseDate, parsePeopleLines, parseStage, parseTemperature, stageFromSheet } from "@/modules/crm/people";

describe("reading a stage from the words people write", () => {
  it("knows the names of the funnel, in Russian and English", () => {
    expect(parseStage("Новый лид")).toBe("NEW");
    expect(parseStage("Первый контакт")).toBe("FIRST_CONTACT");
    expect(parseStage("Прогрев")).toBe("WARMING");
    expect(parseStage("Презентация/встреча")).toBe("PRESENTATION");
    expect(parseStage("Принимает решение")).toBe("DECIDING");
    expect(parseStage("Клиент")).toBe("CLIENT");
    expect(parseStage("Партнёр")).toBe("PARTNER");
    expect(parseStage("партнер")).toBe("PARTNER");
    expect(parseStage("Отказ")).toBe("DECLINED");
    expect(parseStage("Не отвечает")).toBe("NO_REPLY");
    expect(parseStage("partner")).toBe("PARTNER");
  });

  it("knows what a sheet says: what was done, and what was decided", () => {
    expect(parseStage("Видеозвонок")).toBe("PRESENTATION");
    expect(parseStage("Оффлайн встреча")).toBe("PRESENTATION");
    expect(parseStage("Выслал презентацию")).toBe("PRESENTATION");
    expect(parseStage("Запланировать!!!")).toBe("WARMING");
    expect(parseStage("Пока наблюдает")).toBe("WARMING");
    expect(parseStage("Думает")).toBe("DECIDING");
    expect(parseStage("Часть команды")).toBe("PARTNER");
  });

  it("says nothing for words that tell nothing", () => {
    expect(parseStage("Пока нет")).toBeNull();
    expect(parseStage("")).toBeNull();
    expect(parseStage(null)).toBeNull();
    expect(parseStage("что-то совсем другое")).toBeNull();
  });

  it("a decision that means something wins over what was done", () => {
    expect(stageFromSheet("Видеозвонок", "Думает")).toBe("DECIDING");
    expect(stageFromSheet("Оффлайн встреча", "Часть команды")).toBe("PARTNER");
    expect(stageFromSheet("Видеозвонок", "Пока нет")).toBe("PRESENTATION");
    expect(stageFromSheet("Запланировать!!!", "Пока наблюдает")).toBe("WARMING");
    expect(stageFromSheet(null, "Думает")).toBe("DECIDING");
    expect(stageFromSheet("", "")).toBeNull();
  });
});

describe("temperature, interests, influence and dates", () => {
  it("reads how warm a person is", () => {
    expect(parseTemperature("Горячий")).toBe("HOT");
    expect(parseTemperature("Теплый")).toBe("WARM");
    expect(parseTemperature("Тёплый")).toBe("WARM");
    expect(parseTemperature("Средний")).toBe("WARM");
    expect(parseTemperature("Холодный")).toBe("COLD");
    expect(parseTemperature("🔥")).toBe("HOT");
    expect(parseTemperature("❄️ Холодный")).toBe("COLD");
    expect(parseTemperature("")).toBeNull();
    expect(parseTemperature("неизвестно")).toBeNull();
  });

  it("reads interests under their usual names and keeps unknown ones", () => {
    expect(parseInterests("Wellness, Путешествия/MWR")).toEqual(["Wellness", "Путешествия"]);
    expect(parseInterests("Доход/бизнес")).toEqual(["Доход/бизнес"]);
    expect(parseInterests("музыка; Wellness; музыка")).toEqual(["музыка", "Wellness"]);
    expect(parseInterests("")).toEqual([]);
  });

  it("reads influence as a small whole number", () => {
    expect(parseInfluence("11")).toBe(11);
    expect(parseInfluence(" 6 баллов")).toBe(6);
    expect(parseInfluence(3)).toBe(3);
    expect(parseInfluence("много")).toBeNull();
    expect(parseInfluence(250)).toBeNull();
    expect(parseInfluence("")).toBeNull();
  });

  it("reads dates written the way people write them", () => {
    expect(parseLooseDate("20.09.2026")).toBe("2026-09-20T00:00:00.000Z");
    expect(parseLooseDate("3/11/26")).toBe("2026-11-03T00:00:00.000Z");
    expect(parseLooseDate("2026-09-20")).toBe("2026-09-20T00:00:00.000Z");
    expect(parseLooseDate("31.02.2026")).toBeNull();
    expect(parseLooseDate("завтра")).toBeNull();
    expect(parseLooseDate("")).toBeNull();
  });
});

describe("a pasted list of people", () => {
  it("one line, one person; markers and numbers are decoration", () => {
    const r = parsePeopleLines("Anna Kowalska\n- Boris Petrov\n3. Katya and Alex (Cyprus)\n\n  \n•  Dima");
    expect(r.people.map((p) => p.name)).toEqual(["Anna Kowalska", "Boris Petrov", "Katya and Alex (Cyprus)", "Dima"]);
  });

  it("reads a Telegram name, a phone and a note by what they look like", () => {
    const r = parsePeopleLines("Anna K; @annak; +48 600 111 222; met at the fair\nBoris — guitar group\nVera;; 600111222");
    expect(r.people[0]).toEqual({ name: "Anna K", telegram: "@annak", phone: "+48 600 111 222", note: "met at the fair" });
    expect(r.people[1]).toEqual({ name: "Boris", note: "guitar group" });
    expect(r.people[2]).toEqual({ name: "Vera", phone: "600111222" });
  });

  it("a hyphen inside a name is not a note, only a spaced dash is", () => {
    expect(parsePeopleLines("Anna-Maria Smith").people).toEqual([{ name: "Anna-Maria Smith" }]);
    expect(parsePeopleLines("Anna - friend").people).toEqual([{ name: "Anna", note: "friend" }]);
  });

  it("works with Windows line breaks, and stops at the limit and says so", () => {
    expect(parsePeopleLines("A\r\nB\r\n").people).toHaveLength(2);
    const many = Array.from({ length: MAX_PEOPLE_AT_ONCE + 20 }, (_, i) => `Person ${i}`).join("\n");
    const r = parsePeopleLines(many);
    expect(r.people).toHaveLength(MAX_PEOPLE_AT_ONCE);
    expect(r.truncated).toBe(true);
    expect(parsePeopleLines("one").truncated).toBe(false);
    expect(parsePeopleLines("").people).toEqual([]);
  });
});
