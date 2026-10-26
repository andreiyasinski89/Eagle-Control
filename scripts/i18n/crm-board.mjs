const en = {
  crm: {
    tabPipeline: "Pipeline", tabCompanies: "Companies", tabContacts: "Contacts", tabActivities: "Activities",
    planLimit: "Your plan's limit is reached. Upgrade to continue.", error: "Something went wrong", close: "Close", notNow: "Not now",
    newDeal: "New deal", createDeal: "Create deal", dealTitle: "Deal title", amount: "Amount", currency: "Currency", company: "Company", contact: "Contact",
    stage: "Stage", owner: "Owner", me: "Me", expectedClose: "Expected close", nextStep: "Next step", nextStepDate: "Next step date", nextStepHint: "What happens next? A deal without one is highlighted.",
    markWon: "Mark won", markLost: "Mark lost", reopen: "Reopen", won: "Won", lost: "Lost", lostReason: "Reason", lostReasonHint: "Required: it feeds the win/loss report.",
    createProject: "Create project", createProjectTitle: "Create a project for this client?", projectCreated: "Project created", projectCreatedBody: "“{name}” is ready, linked to this deal.", openProject: "Open project",
    wonPrompt: "The deal is won. Create a project from a template so delivery starts right away; name and dates come from the deal.", projectName: "Project name", startHint: "Empty = today",
    logActivity: "Log activity", scheduleMeeting: "Schedule meeting", logCall: "Log call", logEmail: "Log e-mail", addNote: "Add note", activityType: "Type",
    activity: { CALL: "Call", EMAIL: "E-mail", MEETING: "Meeting", NOTE: "Note", TASK: "Task", MESSAGE: "Message" },
    subject: "Subject", details: "Details", dueAt: "When", whenOptional: "When (optional)", dealGone: "This deal no longer exists.", noCompany: "No company",
    daysInStage: "{count, plural, one {# day in stage} other {# days in stage}}", noNextStepWarning: "No next step planned. Add one so the deal does not go cold.", noNextStep: "No next step",
    probability: "Probability %", byStage: "by stage", source: "Source", projects: "Projects", noProjects: "No projects yet.", tags: "Tags", activityFeed: "Activity", noActivities: "Nothing logged yet.",
    scheduled: "scheduled", markDone: "Mark done", comments: "Comments", files: "Files", weighted: "Weighted", showingLatest: "Showing the latest 100.", pipeline: "Pipeline",
    searchDeals: "Search deals", allOwners: "All owners", mine: "Mine", open: "Open",
  },
};

const ru = {
  crm: {
    tabPipeline: "Воронка", tabCompanies: "Компании", tabContacts: "Контакты", tabActivities: "Активности",
    planLimit: "Достигнут лимит тарифа. Перейдите на Pro, чтобы продолжить.", error: "Что-то пошло не так", close: "Закрыть", notNow: "Не сейчас",
    newDeal: "Новая сделка", createDeal: "Создать сделку", dealTitle: "Название сделки", amount: "Сумма", currency: "Валюта", company: "Компания", contact: "Контакт",
    stage: "Стадия", owner: "Ответственный", me: "Я", expectedClose: "Ожидаемое закрытие", nextStep: "Следующий шаг", nextStepDate: "Дата шага", nextStepHint: "Что дальше? Сделка без шага подсвечивается.",
    markWon: "Выиграна", markLost: "Проиграна", reopen: "Вернуть в работу", won: "Выиграна", lost: "Проиграна", lostReason: "Причина", lostReasonHint: "Обязательно: попадает в отчёт по причинам проигрыша.",
    createProject: "Создать проект", createProjectTitle: "Создать проект для клиента?", projectCreated: "Проект создан", projectCreatedBody: "«{name}» готов и связан с этой сделкой.", openProject: "Открыть проект",
    wonPrompt: "Сделка выиграна. Создайте проект из шаблона, чтобы сразу начать работу; название и даты берутся из сделки.", projectName: "Название проекта", startHint: "Пусто = сегодня",
    logActivity: "Записать активность", scheduleMeeting: "Назначить встречу", logCall: "Записать звонок", logEmail: "Записать письмо", addNote: "Добавить заметку", activityType: "Тип",
    activity: { CALL: "Звонок", EMAIL: "Письмо", MEETING: "Встреча", NOTE: "Заметка", TASK: "Задача", MESSAGE: "Сообщение" },
    subject: "Тема", details: "Подробности", dueAt: "Когда", whenOptional: "Когда (необязательно)", dealGone: "Этой сделки больше нет.", noCompany: "Без компании",
    daysInStage: "{count, plural, one {# день на стадии} few {# дня на стадии} many {# дней на стадии} other {# дня на стадии}}", noNextStepWarning: "Следующий шаг не задан. Добавьте его, чтобы сделка не остыла.", noNextStep: "Нет следующего шага",
    probability: "Вероятность %", byStage: "по стадии", source: "Источник", projects: "Проекты", noProjects: "Проектов пока нет.", tags: "Теги", activityFeed: "Активности", noActivities: "Пока ничего не записано.",
    scheduled: "запланировано", markDone: "Выполнено", comments: "Комментарии", files: "Файлы", weighted: "Взвешенно", showingLatest: "Показаны последние 100.", pipeline: "Воронка",
    searchDeals: "Поиск сделок", allOwners: "Все ответственные", mine: "Мои", open: "Открыто",
  },
};

const pl = {
  crm: {
    tabPipeline: "Lejek", tabCompanies: "Firmy", tabContacts: "Kontakty", tabActivities: "Aktywności",
    planLimit: "Osiągnięto limit planu. Przejdź na Pro, aby kontynuować.", error: "Coś poszło nie tak", close: "Zamknij", notNow: "Nie teraz",
    newDeal: "Nowa szansa", createDeal: "Utwórz szansę", dealTitle: "Nazwa szansy", amount: "Kwota", currency: "Waluta", company: "Firma", contact: "Kontakt",
    stage: "Etap", owner: "Opiekun", me: "Ja", expectedClose: "Planowane zamknięcie", nextStep: "Następny krok", nextStepDate: "Data kroku", nextStepHint: "Co dalej? Szansa bez kroku jest wyróżniona.",
    markWon: "Wygrana", markLost: "Przegrana", reopen: "Otwórz ponownie", won: "Wygrana", lost: "Przegrana", lostReason: "Powód", lostReasonHint: "Wymagane: trafia do raportu przyczyn przegranych.",
    createProject: "Utwórz projekt", createProjectTitle: "Utworzyć projekt dla klienta?", projectCreated: "Projekt utworzony", projectCreatedBody: "„{name}” jest gotowy i powiązany z tą szansą.", openProject: "Otwórz projekt",
    wonPrompt: "Szansa wygrana. Utwórz projekt z szablonu, aby od razu zacząć realizację; nazwa i daty pochodzą z szansy.", projectName: "Nazwa projektu", startHint: "Puste = dziś",
    logActivity: "Zapisz aktywność", scheduleMeeting: "Zaplanuj spotkanie", logCall: "Zapisz rozmowę", logEmail: "Zapisz e-mail", addNote: "Dodaj notatkę", activityType: "Typ",
    activity: { CALL: "Rozmowa", EMAIL: "E-mail", MEETING: "Spotkanie", NOTE: "Notatka", TASK: "Zadanie", MESSAGE: "Wiadomość" },
    subject: "Temat", details: "Szczegóły", dueAt: "Kiedy", whenOptional: "Kiedy (opcjonalnie)", dealGone: "Ta szansa już nie istnieje.", noCompany: "Bez firmy",
    daysInStage: "{count, plural, one {# dzień na etapie} few {# dni na etapie} many {# dni na etapie} other {# dnia na etapie}}", noNextStepWarning: "Brak następnego kroku. Dodaj go, aby szansa nie wystygła.", noNextStep: "Brak następnego kroku",
    probability: "Prawdopodobieństwo %", byStage: "wg etapu", source: "Źródło", projects: "Projekty", noProjects: "Brak projektów.", tags: "Tagi", activityFeed: "Aktywności", noActivities: "Nic jeszcze nie zapisano.",
    scheduled: "zaplanowane", markDone: "Zrobione", comments: "Komentarze", files: "Pliki", weighted: "Ważona", showingLatest: "Pokazano ostatnie 100.", pipeline: "Lejek",
    searchDeals: "Szukaj szans", allOwners: "Wszyscy opiekunowie", mine: "Moje", open: "Otwarte",
  },
};

const fragment = { en, ru, pl };
export default fragment;
