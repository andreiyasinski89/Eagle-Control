const en = {
  nav: { myDay: "My day", crmSettings: "CRM", leadCapture: "Lead capture" },
  myday: { title: "My day", allClear: "All clear. Nothing needs your attention today.", overdue: "Overdue", crmTasks: "CRM tasks", today: "Due today", meetings: "Meetings today", join: "Join", needNextStep: "Deals that need a next step", staleDeals: "Deals going cold", coldContacts: "Contacts without a touch", reminders: "Reminders" },
  crm: {
    view: "View", viewBoard: "Board", viewMap: "Map", stagnation: "Stagnation", clientMapHint: "Dashed lines link a deal to the project it started. Red means trouble.",
    stageHasDeals: "Stage “{name}” has deals. Choose where they go, then save again.", stages: "Stages", stageName: "Stage name", moveUp: "Move up", moveDown: "Move down", removeStage: "Remove stage", moveDealsTo: "Move its deals to", newStage: "New stage", addStage: "Add stage", saveStages: "Save stages",
    crmSettings: "CRM settings", pipelines: "Pipelines", pipelinesHint: "Stages, order and win probability. Every pipeline ends with one Won and one Lost stage.", makeDefault: "Make default", deletePipeline: "Delete pipeline", deletePipelineConfirm: "Delete this pipeline? It must have no deals.", newPipeline: "New pipeline",
    lostReasons: "Lost reasons", lostReasonsHint: "A deal can only be marked lost with one of these.", delete: "Delete", newReason: "New reason", add: "Add", projectTemplates: "Project templates", projectTemplatesHint: "Used when a won deal becomes a project. Save an existing project as a template to reuse its structure and timing.",
    builtIn: "built-in", days: "{count, plural, one {# day} other {# days}}", fromProject: "From project", templateName: "Template name", saveAsTemplate: "Save as template", copied: "Copied", copy: "Copy",
    editForm: "Edit form", newForm: "New form", formName: "Internal name", startStage: "Start stage", firstStage: "First stage", workspaceOwner: "Workspace owner", formTitle: "Form title", submitLabel: "Button text", formFields: "Fields",
    formField: { name: "Name", email: "E-mail", phone: "Phone", company: "Company", message: "Message", amount: "Budget" }, required: "required", successMessage: "Thank-you message", consentText: "Consent text", consentTextHint: "Shows a checkbox; ticking it records consent (GDPR).",
    redirectUrl: "Redirect after sending (optional)", allowedOrigins: "Allowed sites", allowedOriginsHint: "One per line. Empty = any site. Browsers on other sites cannot submit.",
    leadCapture: "Lead capture", webForms: "Web forms", noForms: "No forms yet. Create one and paste the code on your site.", enabled: "Enabled", edit: "Edit", deleteFormConfirm: "Delete this form? Embedded copies will stop working.",
    hostedLink: "Link to the hosted form", embedIframe: "Embed code (iframe)", embedHtml: "Plain HTML form", webhook: "Webhook (Tilda, Zapier, Make)", webhookHint: "POST JSON or a form to this URL with an Authorization: Bearer token. Send an Idempotency-Key header to make retries safe.",
    tokenOnce: "Copy this token now. It is shown only once.", tokenExists: "A token exists. Rotating it stops the old one working.", tokenNone: "No token yet.", defaultPipeline: "Default pipeline", rotateConfirm: "Rotate the token? Integrations using the old one will stop working.",
    rotateToken: "Rotate token", createToken: "Create token", incomingLeads: "Incoming leads", noLeadsYet: "Nothing received yet.", ingest: { created: "created", duplicate: "added to existing", rejected: "rejected" },
  },
};

const ru = {
  nav: { myDay: "Мой день", crmSettings: "CRM", leadCapture: "Приём лидов" },
  myday: { title: "Мой день", allClear: "Всё спокойно. Сегодня ничего не требует внимания.", overdue: "Просрочено", crmTasks: "Задачи CRM", today: "На сегодня", meetings: "Встречи сегодня", join: "Подключиться", needNextStep: "Сделки без следующего шага", staleDeals: "Остывающие сделки", coldContacts: "Контакты без касаний", reminders: "Напоминания" },
  crm: {
    view: "Вид", viewBoard: "Доска", viewMap: "Карта", stagnation: "Застой", clientMapHint: "Пунктир связывает сделку с проектом, который из неё вырос. Красный — проблема.",
    stageHasDeals: "На стадии «{name}» есть сделки. Выберите, куда их перенести, и сохраните снова.", stages: "Стадии", stageName: "Название стадии", moveUp: "Выше", moveDown: "Ниже", removeStage: "Удалить стадию", moveDealsTo: "Перенести сделки в", newStage: "Новая стадия", addStage: "Добавить стадию", saveStages: "Сохранить стадии",
    crmSettings: "Настройки CRM", pipelines: "Воронки", pipelinesHint: "Стадии, порядок и вероятность. Каждая воронка заканчивается одной стадией «Выиграна» и одной «Проиграна».", makeDefault: "Сделать основной", deletePipeline: "Удалить воронку", deletePipelineConfirm: "Удалить воронку? В ней не должно быть сделок.", newPipeline: "Новая воронка",
    lostReasons: "Причины проигрыша", lostReasonsHint: "Сделку можно закрыть как проигранную только с одной из этих причин.", delete: "Удалить", newReason: "Новая причина", add: "Добавить", projectTemplates: "Шаблоны проектов", projectTemplatesHint: "Используются, когда выигранная сделка становится проектом. Сохраните существующий проект как шаблон, чтобы повторить его структуру и сроки.",
    builtIn: "встроенный", days: "{count, plural, one {# день} few {# дня} many {# дней} other {# дня}}", fromProject: "Из проекта", templateName: "Название шаблона", saveAsTemplate: "Сохранить как шаблон", copied: "Скопировано", copy: "Копировать",
    editForm: "Редактирование формы", newForm: "Новая форма", formName: "Внутреннее название", startStage: "Стартовая стадия", firstStage: "Первая стадия", workspaceOwner: "Владелец пространства", formTitle: "Заголовок формы", submitLabel: "Текст кнопки", formFields: "Поля",
    formField: { name: "Имя", email: "E-mail", phone: "Телефон", company: "Компания", message: "Сообщение", amount: "Бюджет" }, required: "обязательно", successMessage: "Сообщение после отправки", consentText: "Текст согласия", consentTextHint: "Показывает чекбокс; отметка фиксирует согласие (GDPR).",
    redirectUrl: "Перенаправление после отправки (необязательно)", allowedOrigins: "Разрешённые сайты", allowedOriginsHint: "По одному в строке. Пусто = любой сайт. Браузеры с других сайтов отправить форму не смогут.",
    leadCapture: "Приём лидов", webForms: "Веб-формы", noForms: "Форм пока нет. Создайте форму и вставьте код на сайт.", enabled: "Включена", edit: "Изменить", deleteFormConfirm: "Удалить форму? Встроенные копии перестанут работать.",
    hostedLink: "Ссылка на форму", embedIframe: "Код для вставки (iframe)", embedHtml: "Обычная HTML-форма", webhook: "Webhook (Tilda, Zapier, Make)", webhookHint: "Отправляйте JSON или форму POST-запросом на этот адрес с заголовком Authorization: Bearer. Заголовок Idempotency-Key делает повторы безопасными.",
    tokenOnce: "Скопируйте токен сейчас. Он показывается один раз.", tokenExists: "Токен есть. Перевыпуск отключит старый.", tokenNone: "Токена пока нет.", defaultPipeline: "Воронка по умолчанию", rotateConfirm: "Перевыпустить токен? Интеграции со старым перестанут работать.",
    rotateToken: "Перевыпустить токен", createToken: "Создать токен", incomingLeads: "Входящие лиды", noLeadsYet: "Пока ничего не поступало.", ingest: { created: "создан", duplicate: "добавлено к существующему", rejected: "отклонён" },
  },
};

const pl = {
  nav: { myDay: "Mój dzień", crmSettings: "CRM", leadCapture: "Przechwytywanie leadów" },
  myday: { title: "Mój dzień", allClear: "Wszystko w porządku. Dziś nic nie wymaga uwagi.", overdue: "Po terminie", crmTasks: "Zadania CRM", today: "Na dziś", meetings: "Dzisiejsze spotkania", join: "Dołącz", needNextStep: "Szanse bez następnego kroku", staleDeals: "Stygnące szanse", coldContacts: "Kontakty bez kontaktu", reminders: "Przypomnienia" },
  crm: {
    view: "Widok", viewBoard: "Tablica", viewMap: "Mapa", stagnation: "Stagnacja", clientMapHint: "Linia przerywana łączy szansę z projektem, który z niej powstał. Czerwony oznacza problem.",
    stageHasDeals: "Etap „{name}” zawiera szanse. Wybierz, dokąd je przenieść, i zapisz ponownie.", stages: "Etapy", stageName: "Nazwa etapu", moveUp: "W górę", moveDown: "W dół", removeStage: "Usuń etap", moveDealsTo: "Przenieś szanse do", newStage: "Nowy etap", addStage: "Dodaj etap", saveStages: "Zapisz etapy",
    crmSettings: "Ustawienia CRM", pipelines: "Lejki", pipelinesHint: "Etapy, kolejność i prawdopodobieństwo. Każdy lejek kończy się jednym etapem Wygrana i jednym Przegrana.", makeDefault: "Ustaw jako domyślny", deletePipeline: "Usuń lejek", deletePipelineConfirm: "Usunąć lejek? Nie może zawierać szans.", newPipeline: "Nowy lejek",
    lostReasons: "Powody przegranej", lostReasonsHint: "Szansę można oznaczyć jako przegraną tylko z jednym z tych powodów.", delete: "Usuń", newReason: "Nowy powód", add: "Dodaj", projectTemplates: "Szablony projektów", projectTemplatesHint: "Używane, gdy wygrana szansa staje się projektem. Zapisz istniejący projekt jako szablon, aby powtórzyć jego strukturę i terminy.",
    builtIn: "wbudowany", days: "{count, plural, one {# dzień} few {# dni} many {# dni} other {# dnia}}", fromProject: "Z projektu", templateName: "Nazwa szablonu", saveAsTemplate: "Zapisz jako szablon", copied: "Skopiowano", copy: "Kopiuj",
    editForm: "Edycja formularza", newForm: "Nowy formularz", formName: "Nazwa wewnętrzna", startStage: "Etap początkowy", firstStage: "Pierwszy etap", workspaceOwner: "Właściciel przestrzeni", formTitle: "Tytuł formularza", submitLabel: "Tekst przycisku", formFields: "Pola",
    formField: { name: "Imię", email: "E-mail", phone: "Telefon", company: "Firma", message: "Wiadomość", amount: "Budżet" }, required: "wymagane", successMessage: "Komunikat po wysłaniu", consentText: "Treść zgody", consentTextHint: "Pokazuje pole wyboru; zaznaczenie zapisuje zgodę (RODO).",
    redirectUrl: "Przekierowanie po wysłaniu (opcjonalnie)", allowedOrigins: "Dozwolone strony", allowedOriginsHint: "Po jednej w wierszu. Puste = dowolna strona. Przeglądarki z innych stron nie wyślą formularza.",
    leadCapture: "Przechwytywanie leadów", webForms: "Formularze WWW", noForms: "Brak formularzy. Utwórz formularz i wklej kod na swojej stronie.", enabled: "Włączony", edit: "Edytuj", deleteFormConfirm: "Usunąć formularz? Osadzone kopie przestaną działać.",
    hostedLink: "Link do formularza", embedIframe: "Kod do osadzenia (iframe)", embedHtml: "Zwykły formularz HTML", webhook: "Webhook (Tilda, Zapier, Make)", webhookHint: "Wyślij JSON lub formularz metodą POST na ten adres z nagłówkiem Authorization: Bearer. Nagłówek Idempotency-Key zabezpiecza ponowienia.",
    tokenOnce: "Skopiuj token teraz. Jest pokazywany tylko raz.", tokenExists: "Token istnieje. Wygenerowanie nowego wyłączy stary.", tokenNone: "Brak tokenu.", defaultPipeline: "Lejek domyślny", rotateConfirm: "Wygenerować nowy token? Integracje ze starym przestaną działać.",
    rotateToken: "Nowy token", createToken: "Utwórz token", incomingLeads: "Przychodzące leady", noLeadsYet: "Nic jeszcze nie wpłynęło.", ingest: { created: "utworzony", duplicate: "dodano do istniejącego", rejected: "odrzucony" },
  },
};

const fragment = { en, ru, pl };
export default fragment;
