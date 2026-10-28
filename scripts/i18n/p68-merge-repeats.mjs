const f = (o) => ({ views: o });
const fragment = {
  en: f({
    mergeRepeats: "Merge repeats", mergeTitle: "Merge repeating events",
    mergeIntro: "These events look like one meeting entered again and again. Each group becomes one event that repeats; the copies are archived and can be restored.",
    mergeInfo: "{n, plural, one {# date} other {# dates}}, {first} – {last}", mergeResult: "Becomes 1 event · {rule} · {time}",
    mergeSkipped: "{n, plural, one {# date left out} other {# dates left out}}", mergeEndNote: "The series ends on the last date that was entered; you can extend it later.",
    mergeSelected: "Merge ({n})", mergeDone: "Done: {merged, plural, one {# series} other {# series}} merged, {archived, plural, one {# copy} other {# copies}} archived.", mergeFailed: "Could not merge. Please try again.",
  }),
  ru: f({
    mergeRepeats: "Объединить повторы", mergeTitle: "Объединить повторяющиеся события",
    mergeIntro: "Эти события похожи на одну встречу, внесённую много раз. Каждая группа станет одним событием с повтором; копии уйдут в архив, их можно восстановить.",
    mergeInfo: "{n, plural, one {# дата} few {# даты} many {# дат} other {# даты}}, {first} – {last}", mergeResult: "Станет 1 событие · {rule} · {time}",
    mergeSkipped: "{n, plural, one {# дата пропущена} few {# даты пропущены} many {# дат пропущено} other {# даты пропущены}}", mergeEndNote: "Серия закончится на последней внесённой дате; позже её можно продлить.",
    mergeSelected: "Объединить ({n})", mergeDone: "Готово: объединено серий — {merged}, убрано копий — {archived}.", mergeFailed: "Не удалось объединить. Попробуйте ещё раз.",
  }),
  pl: f({
    mergeRepeats: "Scal powtórzenia", mergeTitle: "Scal powtarzające się wydarzenia",
    mergeIntro: "Te wydarzenia wyglądają na jedno spotkanie wpisywane wielokrotnie. Każda grupa stanie się jednym powtarzającym się wydarzeniem; kopie trafią do archiwum i można je przywrócić.",
    mergeInfo: "{n, plural, one {# data} few {# daty} many {# dat} other {# daty}}, {first} – {last}", mergeResult: "Będzie 1 wydarzenie · {rule} · {time}",
    mergeSkipped: "{n, plural, one {# data pominięta} few {# daty pominięte} many {# dat pominiętych} other {# daty pominięte}}", mergeEndNote: "Seria kończy się na ostatniej wpisanej dacie; później można ją wydłużyć.",
    mergeSelected: "Scal ({n})", mergeDone: "Gotowe: scalono serii — {merged}, zarchiwizowano kopii — {archived}.", mergeFailed: "Nie udało się scalić. Spróbuj ponownie.",
  }),
  uk: f({
    mergeRepeats: "Об'єднати повтори", mergeTitle: "Об'єднати події, що повторюються",
    mergeIntro: "Ці події схожі на одну зустріч, внесену багато разів. Кожна група стане однією подією з повтором; копії підуть в архів, їх можна відновити.",
    mergeInfo: "{n, plural, one {# дата} few {# дати} many {# дат} other {# дати}}, {first} – {last}", mergeResult: "Стане 1 подія · {rule} · {time}",
    mergeSkipped: "{n, plural, one {# дату пропущено} few {# дати пропущено} many {# дат пропущено} other {# дати пропущено}}", mergeEndNote: "Серія закінчиться на останній внесеній даті; пізніше її можна продовжити.",
    mergeSelected: "Об'єднати ({n})", mergeDone: "Готово: об'єднано серій — {merged}, прибрано копій — {archived}.", mergeFailed: "Не вдалося об'єднати. Спробуйте ще раз.",
  }),
};
export default fragment;
