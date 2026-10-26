const en = {
  nav: { notifications: "Notifications" },
  notifications: {
    title: "Notifications", markAll: "Mark all as read", empty: "Nothing new.", settings: "Notification settings", error: "Something went wrong",
    prefsTitle: "Notification settings", prefsHint: "The bell always gets a copy. Choose where else each event should reach you.", event: "Event", connectHint: "Slack and Telegram only deliver once you have connected them in Settings → Integrations.",
    channel: { app: "In app", email: "E-mail", slack: "Slack", telegram: "Telegram" },
    kind: { mention: "Someone mentions me", assigned: "A task is assigned to me", lead: "A new lead arrives", deal_won: "A deal is won", project_red: "A project turns red", reminder: "A reminder is due", sprint_ended: "A sprint ends", due_today: "Work is due today", cold_contact: "A contact goes cold", stale_deal: "A deal goes cold" },
  },
};
const ru = {
  nav: { notifications: "Уведомления" },
  notifications: {
    title: "Уведомления", markAll: "Прочитать все", empty: "Новых нет.", settings: "Настройки уведомлений", error: "Что-то пошло не так",
    prefsTitle: "Настройки уведомлений", prefsHint: "В колокольчик копия приходит всегда. Выберите, куда ещё доставлять каждое событие.", event: "Событие", connectHint: "Slack и Telegram доставляют только после подключения в Настройки → Интеграции.",
    channel: { app: "В приложении", email: "E-mail", slack: "Slack", telegram: "Telegram" },
    kind: { mention: "Меня упомянули", assigned: "Мне назначили задачу", lead: "Пришёл новый лид", deal_won: "Сделка выиграна", project_red: "Проект стал красным", reminder: "Сработало напоминание", sprint_ended: "Спринт завершился", due_today: "Срок сегодня", cold_contact: "Контакт остывает", stale_deal: "Сделка остывает" },
  },
};
const pl = {
  nav: { notifications: "Powiadomienia" },
  notifications: {
    title: "Powiadomienia", markAll: "Oznacz wszystkie jako przeczytane", empty: "Brak nowych.", settings: "Ustawienia powiadomień", error: "Coś poszło nie tak",
    prefsTitle: "Ustawienia powiadomień", prefsHint: "Dzwonek zawsze dostaje kopię. Wybierz, gdzie jeszcze mają trafiać poszczególne zdarzenia.", event: "Zdarzenie", connectHint: "Slack i Telegram działają dopiero po połączeniu w Ustawienia → Integracje.",
    channel: { app: "W aplikacji", email: "E-mail", slack: "Slack", telegram: "Telegram" },
    kind: { mention: "Ktoś mnie wspomina", assigned: "Przypisano mi zadanie", lead: "Nowy lead", deal_won: "Wygrana szansa", project_red: "Projekt zrobił się czerwony", reminder: "Nadszedł czas przypomnienia", sprint_ended: "Sprint się kończy", due_today: "Termin dziś", cold_contact: "Kontakt stygnie", stale_deal: "Szansa stygnie" },
  },
};
const fragment = { en, ru, pl };
export default fragment;
