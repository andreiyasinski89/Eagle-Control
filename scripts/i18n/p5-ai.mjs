const en = {
  ai: {
    title: "AI assistant", error: "Something went wrong", generate: "Generate", thinking: "Thinking…", draft: "Draft", copy: "Copy", copied: "Copied", draftNote: "A draft for you to edit. Nothing is posted or sent.",
    tab: { summary: "Team summary", client: "Client update", ask: "Ask" },
    hint: { summary: "A status report from the whole project, including internal comments. For the team only.", client: "A friendly update written only from what is shared with clients. Check it before you send it.", ask: "Ask anything about this project." },
    question: "Your question", notConfigured: "AI is not configured on this server.", usage: "{used}k of {quota}k tokens used this month", exhausted: "This month's allowance is used up. It renews on {date}.",
    suggestSubtasks: "Suggest subtasks", fieldTitle: "Title", nothingNew: "Nothing new to add.", addSelected: "Add selected", discard: "Discard", draftReply: "Draft a reply", intent: "What do you want to say? (optional)",
  },
};
const ru = {
  ai: {
    title: "AI-помощник", error: "Что-то пошло не так", generate: "Составить", thinking: "Думаю…", draft: "Черновик", copy: "Копировать", copied: "Скопировано", draftNote: "Черновик для правки. Ничего не публикуется и не отправляется.",
    tab: { summary: "Сводка для команды", client: "Обновление для клиента", ask: "Вопрос" },
    hint: { summary: "Отчёт о состоянии по всему проекту, включая внутренние комментарии. Только для команды.", client: "Дружелюбное обновление только по тому, что открыто клиентам. Проверьте перед отправкой.", ask: "Спросите что угодно об этом проекте." },
    question: "Ваш вопрос", notConfigured: "AI не настроен на этом сервере.", usage: "Использовано {used} тыс. из {quota} тыс. токенов за месяц", exhausted: "Лимит этого месяца исчерпан. Обновится {date}.",
    suggestSubtasks: "Предложить подзадачи", fieldTitle: "Название", nothingNew: "Нечего добавить.", addSelected: "Добавить выбранные", discard: "Отмена", draftReply: "Составить ответ", intent: "Что вы хотите сказать? (необязательно)",
  },
};
const pl = {
  ai: {
    title: "Asystent AI", error: "Coś poszło nie tak", generate: "Utwórz", thinking: "Myślę…", draft: "Szkic", copy: "Kopiuj", copied: "Skopiowano", draftNote: "Szkic do edycji. Nic nie jest publikowane ani wysyłane.",
    tab: { summary: "Podsumowanie dla zespołu", client: "Aktualizacja dla klienta", ask: "Pytanie" },
    hint: { summary: "Raport o stanie całego projektu, w tym wewnętrzne komentarze. Tylko dla zespołu.", client: "Przyjazna aktualizacja oparta tylko na tym, co udostępniono klientom. Sprawdź przed wysłaniem.", ask: "Zapytaj o cokolwiek w tym projekcie." },
    question: "Twoje pytanie", notConfigured: "AI nie jest skonfigurowane na tym serwerze.", usage: "Wykorzystano {used} tys. z {quota} tys. tokenów w tym miesiącu", exhausted: "Limit tego miesiąca wyczerpany. Odnowi się {date}.",
    suggestSubtasks: "Zaproponuj podzadania", fieldTitle: "Tytuł", nothingNew: "Nie ma nic nowego do dodania.", addSelected: "Dodaj zaznaczone", discard: "Odrzuć", draftReply: "Napisz odpowiedź", intent: "Co chcesz przekazać? (opcjonalnie)",
  },
};
const fragment = { en, ru, pl };
export default fragment;
