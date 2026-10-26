const en = {
  notifications: { kind: { client_activity: "A client comments, uploads or answers" } },
  drawer: {
    client: "Client", shareWithClient: "Share with clients (they see it in the portal)", shareHint: "Clients see the title, status, dates and progress, and the comments and files you mark as visible to them.",
    askApproval: "Ask for approval", approvalRequest: "What should they approve? (optional)", approved: "Approved", changesRequested: "Changes requested", awaitingClient: "Waiting for the client",
    visibleToClient: "Visible to client", shareFile: "Share with client",
  },
  portal: {
    error: "Something went wrong", unavailable: "The client portal is not available for this workspace.", preview: "Preview", backToApp: "Back to the app", signOut: "Sign out",
    yourProjects: "Your projects", noProjects: "No projects have been shared with you yet.", needsYou: "{n, plural, one {# thing needs your answer} other {# things need your answer}}",
    health: { GREEN: "On track", YELLOW: "At risk", RED: "Delayed" }, status: { BACKLOG: "Planned", TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", DONE: "Done", CANCELLED: "Cancelled" },
    previewNote: "You are previewing the portal as a client sees it. Approvals can only be given by clients.", work: "Work", nothingShared: "Nothing has been shared here yet.", awaiting: "Needs your answer", document: "Document",
    details: "Details", close: "Close", approval: "Approval", pleaseApprove: "Please review and approve.", approve: "Approve", requestChanges: "Request changes", sendChanges: "Send", whatToChange: "What should change?",
    previewCannotDecide: "Only the client can answer this.", approvedOn: "Approved on {date}", changesOn: "Changes requested on {date}: {note}",
    files: "Files", noFiles: "No files yet.", upload: "Upload a file", conversation: "Conversation", you: "You", team: "team", noComments: "No messages yet.", writeMessage: "Write a message to the team", send: "Send",
  },
};
const ru = {
  notifications: { kind: { client_activity: "Клиент комментирует, загружает файл или отвечает" } },
  drawer: {
    client: "Клиент", shareWithClient: "Показать клиентам (в клиентском портале)", shareHint: "Клиенты видят название, статус, сроки и прогресс, а также комментарии и файлы, которые вы пометите для них.",
    askApproval: "Запросить согласование", approvalRequest: "Что согласовать? (необязательно)", approved: "Согласовано", changesRequested: "Нужны правки", awaitingClient: "Ждём клиента",
    visibleToClient: "Видно клиенту", shareFile: "Показать клиенту",
  },
  portal: {
    error: "Что-то пошло не так", unavailable: "Клиентский портал недоступен для этого пространства.", preview: "Просмотр", backToApp: "Вернуться в приложение", signOut: "Выйти",
    yourProjects: "Ваши проекты", noProjects: "Вам пока не открыто ни одного проекта.", needsYou: "{n, plural, one {# вопрос ждёт вашего ответа} few {# вопроса ждут вашего ответа} many {# вопросов ждут вашего ответа} other {# вопроса ждут вашего ответа}}",
    health: { GREEN: "По плану", YELLOW: "Есть риски", RED: "Отставание" }, status: { BACKLOG: "В планах", TODO: "К выполнению", IN_PROGRESS: "В работе", IN_REVIEW: "На проверке", DONE: "Готово", CANCELLED: "Отменено" },
    previewNote: "Вы смотрите портал так, как его видит клиент. Согласовывать могут только клиенты.", work: "Работы", nothingShared: "Здесь пока ничего не показано.", awaiting: "Ждёт вашего ответа", document: "Документ",
    details: "Подробности", close: "Закрыть", approval: "Согласование", pleaseApprove: "Пожалуйста, посмотрите и согласуйте.", approve: "Согласовать", requestChanges: "Запросить правки", sendChanges: "Отправить", whatToChange: "Что нужно изменить?",
    previewCannotDecide: "Ответить может только клиент.", approvedOn: "Согласовано {date}", changesOn: "Правки запрошены {date}: {note}",
    files: "Файлы", noFiles: "Файлов пока нет.", upload: "Загрузить файл", conversation: "Переписка", you: "Вы", team: "команда", noComments: "Сообщений пока нет.", writeMessage: "Написать команде", send: "Отправить",
  },
};
const pl = {
  notifications: { kind: { client_activity: "Klient komentuje, przesyła plik lub odpowiada" } },
  drawer: {
    client: "Klient", shareWithClient: "Udostępnij klientom (w portalu klienta)", shareHint: "Klienci widzą tytuł, status, terminy i postęp oraz komentarze i pliki oznaczone dla nich.",
    askApproval: "Poproś o akceptację", approvalRequest: "Co mają zaakceptować? (opcjonalnie)", approved: "Zaakceptowano", changesRequested: "Potrzebne poprawki", awaitingClient: "Czekamy na klienta",
    visibleToClient: "Widoczne dla klienta", shareFile: "Udostępnij klientowi",
  },
  portal: {
    error: "Coś poszło nie tak", unavailable: "Portal klienta nie jest dostępny dla tej przestrzeni.", preview: "Podgląd", backToApp: "Wróć do aplikacji", signOut: "Wyloguj",
    yourProjects: "Twoje projekty", noProjects: "Nie udostępniono Ci jeszcze żadnych projektów.", needsYou: "{n, plural, one {# sprawa czeka na Twoją odpowiedź} few {# sprawy czekają na Twoją odpowiedź} many {# spraw czeka na Twoją odpowiedź} other {# sprawy czeka na Twoją odpowiedź}}",
    health: { GREEN: "Zgodnie z planem", YELLOW: "Ryzyko", RED: "Opóźnienie" }, status: { BACKLOG: "Zaplanowane", TODO: "Do zrobienia", IN_PROGRESS: "W toku", IN_REVIEW: "W przeglądzie", DONE: "Gotowe", CANCELLED: "Anulowane" },
    previewNote: "Oglądasz portal tak, jak widzi go klient. Akceptować mogą tylko klienci.", work: "Prace", nothingShared: "Nic jeszcze tu nie udostępniono.", awaiting: "Czeka na Twoją odpowiedź", document: "Dokument",
    details: "Szczegóły", close: "Zamknij", approval: "Akceptacja", pleaseApprove: "Prosimy o przejrzenie i akceptację.", approve: "Akceptuję", requestChanges: "Poproś o zmiany", sendChanges: "Wyślij", whatToChange: "Co należy zmienić?",
    previewCannotDecide: "Odpowiedzieć może tylko klient.", approvedOn: "Zaakceptowano {date}", changesOn: "Poproszono o zmiany {date}: {note}",
    files: "Pliki", noFiles: "Brak plików.", upload: "Prześlij plik", conversation: "Rozmowa", you: "Ty", team: "zespół", noComments: "Brak wiadomości.", writeMessage: "Napisz do zespołu", send: "Wyślij",
  },
};
const fragment = { en, ru, pl };
export default fragment;
