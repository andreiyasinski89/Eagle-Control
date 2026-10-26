const en = {
  nav: { time: "Time" },
  drawer: { time: "Time" },
  members: { hourlyRate: "Rate/h" },
  time: {
    tab: "Time & billing", timesheet: "My timesheet", prevWeek: "Previous week", nextWeek: "Next week", thisWeek: "This week", emptyWeek: "No time logged this week.",
    task: "Task", sum: "Total", total: "Total: {value}", billableOf: "billable {value}",
    start: "Start timer", stop: "Stop timer", log: "Log time", duration: "Duration", durationPlaceholder: "1h 30m", date: "Date", note: "Note", billable: "Billable", nonBillable: "non-billable",
    delete: "Delete entry", none: "Nothing logged yet.", badDuration: "Enter a duration like 90, 1:30 or 1h 30m (up to 24 hours).", error: "Something went wrong",
    from: "From", to: "To", currency: "Currency", print: "Print", hours: "Hours", billableHours: "Billable", amount: "Amount", moneyHidden: "Rates are visible to owners and admins.",
    byProject: "By project", byPerson: "By person", entries: "Entries", project: "Project", person: "Person",
  },
};
const ru = {
  nav: { time: "Время" },
  drawer: { time: "Время" },
  members: { hourlyRate: "Ставка/ч" },
  time: {
    tab: "Время и счета", timesheet: "Мой табель", prevWeek: "Предыдущая неделя", nextWeek: "Следующая неделя", thisWeek: "Эта неделя", emptyWeek: "На этой неделе время не учтено.",
    task: "Задача", sum: "Итого", total: "Всего: {value}", billableOf: "оплачиваемо {value}",
    start: "Запустить таймер", stop: "Остановить таймер", log: "Записать время", duration: "Длительность", durationPlaceholder: "1ч 30м", date: "Дата", note: "Заметка", billable: "Оплачиваемое", nonBillable: "неоплачиваемое",
    delete: "Удалить запись", none: "Пока ничего не записано.", badDuration: "Введите длительность: 90, 1:30 или 1h 30m (до 24 часов).", error: "Что-то пошло не так",
    from: "С", to: "По", currency: "Валюта", print: "Печать", hours: "Часы", billableHours: "Оплачиваемые", amount: "Сумма", moneyHidden: "Ставки видны владельцам и администраторам.",
    byProject: "По проектам", byPerson: "По людям", entries: "Записи", project: "Проект", person: "Человек",
  },
};
const pl = {
  nav: { time: "Czas" },
  drawer: { time: "Czas" },
  members: { hourlyRate: "Stawka/h" },
  time: {
    tab: "Czas i rozliczenia", timesheet: "Mój arkusz czasu", prevWeek: "Poprzedni tydzień", nextWeek: "Następny tydzień", thisWeek: "Ten tydzień", emptyWeek: "W tym tygodniu nie zapisano czasu.",
    task: "Zadanie", sum: "Razem", total: "Razem: {value}", billableOf: "do rozliczenia {value}",
    start: "Uruchom stoper", stop: "Zatrzymaj stoper", log: "Zapisz czas", duration: "Czas trwania", durationPlaceholder: "1h 30m", date: "Data", note: "Notatka", billable: "Rozliczalne", nonBillable: "nierozliczalne",
    delete: "Usuń wpis", none: "Nic jeszcze nie zapisano.", badDuration: "Podaj czas, np. 90, 1:30 lub 1h 30m (do 24 godzin).", error: "Coś poszło nie tak",
    from: "Od", to: "Do", currency: "Waluta", print: "Drukuj", hours: "Godziny", billableHours: "Rozliczalne", amount: "Kwota", moneyHidden: "Stawki widzą właściciele i administratorzy.",
    byProject: "Wg projektów", byPerson: "Wg osób", entries: "Wpisy", project: "Projekt", person: "Osoba",
  },
};
const fragment = { en, ru, pl };
export default fragment;
