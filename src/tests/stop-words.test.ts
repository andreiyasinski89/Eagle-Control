import { describe, expect, it } from "vitest";
import { findStopWords } from "@/modules/crm/stop-words";

describe("Stop words", () => {
  it.each([
    ["Это пассивный доход для тебя", "пассивный доход"],
    ["Хочешь пассивного дохода?", "пассивный доход"],
    ["Путь к финансовой свободе", "финансовая свобода"],
    ["Гарантированный заработок каждый месяц", "гарантированный доход"],
    ["Быстрые деньги без усилий", "лёгкие/быстрые деньги"],
    ["Можно зарабатывать 2000 € в месяц", "сумма дохода"],
    ["Zarabiaj pasywny dochód", "pasywny dochód"],
    ["Zbuduj wolność finansową", "wolność finansowa"],
    ["Passive income for everyone", "passive income"],
    ["Your FINANCIAL FREEDOM starts here", "financial freedom"],
  ] as const)("flags %s", (text, label) => {
    expect(findStopWords(text)).toEqual([label]);
  });

  it("lets a normal message through", () => {
    expect(findStopWords("Валентин, привет! Как насчёт созвона в четверг? Расскажу про клуб, отели и поездки.")).toEqual([]);
    expect(findStopWords("Ты видел цены на отели в Батуми? Скидки до 30%.")).toEqual([]);
  });

  it("ignores case and ё", () => {
    expect(findStopWords("ЛЁГКИЕ ДЕНЬГИ")).toEqual(["лёгкие/быстрые деньги"]);
  });
});
