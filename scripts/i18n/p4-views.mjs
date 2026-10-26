const en = {
  views: {
    switcher: "View", kind: { map: "Map", kanban: "Board", list: "List", calendar: "Calendar", timeline: "Timeline" },
    error: "Something went wrong", blocked: "Blocked", unassigned: "Unassigned", anyone: "Anyone", anyStatus: "Any status",
    search: "Search tasks", title: "Task", status: "Status", assignee: "Assignee", due: "Due", progress: "Progress", estimate: "Estimate",
    count: "{n, plural, one {# task} other {# tasks}}", empty: "No tasks match.", open: "Open {title}",
    bulk: "Bulk edit", selected: "{n} selected", setStatus: "Set status…", setAssignee: "Set assignee…", setDue: "Set due date", apply: "Apply", clear: "Clear", selectAll: "Select all", selectRow: "Select {title}",
    onlyMine: "Only mine", emptyColumn: "Nothing here", moveTo: "Move {title} to",
    prev: "Previous", next: "Next", today: "Today", month: "Month", week: "Week", more: "+{n} more",
    calendarTitle: "Calendar",
    itemKind: { task: "Task", milestone: "Epic / sprint", event: "Event", crm_activity: "CRM activity", deal_step: "Deal next step", deal_close: "Deal expected close" },
    zoom: "Zoom", zoomLevel: { day: "Days", week: "Weeks", month: "Months" },
    timelineHint: "Drag a bar to move both dates. Red arrows show a blocker that ends after the blocked task starts.",
    noDates: "No task has a start or due date yet.", unscheduled: "{n} without dates",
  },
};
const ru = {
  views: {
    switcher: "Вид", kind: { map: "Карта", kanban: "Доска", list: "Список", calendar: "Календарь", timeline: "Таймлайн" },
    error: "Что-то пошло не так", blocked: "Заблокирована", unassigned: "Не назначено", anyone: "Любой", anyStatus: "Любой статус",
    search: "Поиск задач", title: "Задача", status: "Статус", assignee: "Исполнитель", due: "Срок", progress: "Прогресс", estimate: "Оценка",
    count: "{n, plural, one {# задача} few {# задачи} many {# задач} other {# задачи}}", empty: "Нет подходящих задач.", open: "Открыть {title}",
    bulk: "Массовое изменение", selected: "Выбрано: {n}", setStatus: "Задать статус…", setAssignee: "Назначить…", setDue: "Задать срок", apply: "Применить", clear: "Сбросить", selectAll: "Выбрать все", selectRow: "Выбрать {title}",
    onlyMine: "Только мои", emptyColumn: "Пусто", moveTo: "Переместить {title} в",
    prev: "Назад", next: "Вперёд", today: "Сегодня", month: "Месяц", week: "Неделя", more: "ещё {n}",
    calendarTitle: "Календарь",
    itemKind: { task: "Задача", milestone: "Эпик / спринт", event: "Событие", crm_activity: "Активность CRM", deal_step: "Следующий шаг сделки", deal_close: "Ожидаемое закрытие сделки" },
    zoom: "Масштаб", zoomLevel: { day: "Дни", week: "Недели", month: "Месяцы" },
    timelineHint: "Перетащите полосу, чтобы сдвинуть обе даты. Красная стрелка: блокирующая задача заканчивается позже начала заблокированной.",
    noDates: "Ни у одной задачи пока нет даты начала или срока.", unscheduled: "Без дат: {n}",
  },
};
const pl = {
  views: {
    switcher: "Widok", kind: { map: "Mapa", kanban: "Tablica", list: "Lista", calendar: "Kalendarz", timeline: "Oś czasu" },
    error: "Coś poszło nie tak", blocked: "Zablokowane", unassigned: "Nieprzypisane", anyone: "Ktokolwiek", anyStatus: "Dowolny status",
    search: "Szukaj zadań", title: "Zadanie", status: "Status", assignee: "Przypisany", due: "Termin", progress: "Postęp", estimate: "Szacunek",
    count: "{n, plural, one {# zadanie} few {# zadania} many {# zadań} other {# zadania}}", empty: "Brak pasujących zadań.", open: "Otwórz {title}",
    bulk: "Edycja zbiorcza", selected: "Zaznaczono: {n}", setStatus: "Ustaw status…", setAssignee: "Przypisz…", setDue: "Ustaw termin", apply: "Zastosuj", clear: "Wyczyść", selectAll: "Zaznacz wszystkie", selectRow: "Zaznacz {title}",
    onlyMine: "Tylko moje", emptyColumn: "Pusto", moveTo: "Przenieś {title} do",
    prev: "Wstecz", next: "Dalej", today: "Dziś", month: "Miesiąc", week: "Tydzień", more: "+{n} więcej",
    calendarTitle: "Kalendarz",
    itemKind: { task: "Zadanie", milestone: "Epik / sprint", event: "Wydarzenie", crm_activity: "Aktywność CRM", deal_step: "Następny krok szansy", deal_close: "Oczekiwane zamknięcie szansy" },
    zoom: "Skala", zoomLevel: { day: "Dni", week: "Tygodnie", month: "Miesiące" },
    timelineHint: "Przeciągnij pasek, aby przesunąć obie daty. Czerwona strzałka: blokujące zadanie kończy się po starcie zablokowanego.",
    noDates: "Żadne zadanie nie ma jeszcze daty rozpoczęcia ani terminu.", unscheduled: "Bez dat: {n}",
  },
};
const fragment = { en, ru, pl };
export default fragment;
