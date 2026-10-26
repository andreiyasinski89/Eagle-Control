const en = {
  nav: { integrations: "Integrations" },
  drawer: { addMeet: "Create a Google Meet link when synced", location: "Location" },
  integrations: {
    title: "Integrations", error: "Something went wrong", paywallTitle: "Integrations are part of the Pro plan", paywallText: "Two-way Google Calendar, Slack announcements and the Telegram bot.",
    notConfigured: "Not configured on this server yet. An administrator has to add the provider keys first.", connect: "Connect", reconnect: "Reconnect", disconnect: "Disconnect", connected: "Connected", off: "Off",
    justConnected: "{name} is connected.", failed: "The connection did not complete ({code}).",
    google: { title: "Google Calendar", hint: "Events you create here appear in your Google Calendar, with a Meet link on request. Changes and deletions in Google come back.", sync: "Sync now", polling: "Changes are checked every few minutes." },
    slack: { title: "Slack", hint: "Post new leads, won deals, red projects and finished sprints to a channel.", adminOnly: "Only owners and admins can set up Slack.", loadChannels: "Load channels", nowhere: "Nowhere", event: { lead: "New lead", deal_won: "Deal won", project_red: "Project turns red", sprint_ended: "Sprint ends" } },
    telegram: { title: "Telegram", hint: "Get notifications in Telegram and use /today, /task, /done and /lead from the chat.", link: "Create link code", open: "Open @{bot} and press Start", manual: "In Telegram, send /start {code} to @{bot}.", expires: "The code works for 15 minutes.", check: "I pressed Start", commands: "Send /help to the bot for the list of commands." },
  },
};
const ru = {
  nav: { integrations: "Интеграции" },
  drawer: { addMeet: "Создать ссылку Google Meet при синхронизации", location: "Место" },
  integrations: {
    title: "Интеграции", error: "Что-то пошло не так", paywallTitle: "Интеграции входят в тариф Pro", paywallText: "Двусторонний Google Calendar, уведомления в Slack и бот в Telegram.",
    notConfigured: "На этом сервере ещё не настроено. Администратору нужно добавить ключи провайдера.", connect: "Подключить", reconnect: "Подключить заново", disconnect: "Отключить", connected: "Подключено", off: "Выключено",
    justConnected: "{name}: подключено.", failed: "Подключение не завершилось ({code}).",
    google: { title: "Google Calendar", hint: "События, созданные здесь, появляются в вашем Google Calendar, при желании со ссылкой Meet. Изменения и удаления в Google возвращаются сюда.", sync: "Синхронизировать", polling: "Изменения проверяются раз в несколько минут." },
    slack: { title: "Slack", hint: "Новые лиды, выигранные сделки, красные проекты и завершённые спринты — в канал.", adminOnly: "Slack настраивают только владельцы и администраторы.", loadChannels: "Загрузить каналы", nowhere: "Никуда", event: { lead: "Новый лид", deal_won: "Сделка выиграна", project_red: "Проект стал красным", sprint_ended: "Спринт завершён" } },
    telegram: { title: "Telegram", hint: "Уведомления в Telegram и команды /today, /task, /done, /lead прямо из чата.", link: "Создать код привязки", open: "Откройте @{bot} и нажмите Start", manual: "В Telegram отправьте /start {code} боту @{bot}.", expires: "Код действует 15 минут.", check: "Я нажал Start", commands: "Отправьте боту /help, чтобы увидеть команды." },
  },
};
const pl = {
  nav: { integrations: "Integracje" },
  drawer: { addMeet: "Utwórz link Google Meet przy synchronizacji", location: "Miejsce" },
  integrations: {
    title: "Integracje", error: "Coś poszło nie tak", paywallTitle: "Integracje są częścią planu Pro", paywallText: "Dwukierunkowy Kalendarz Google, powiadomienia w Slacku i bot w Telegramie.",
    notConfigured: "Nie skonfigurowano jeszcze na tym serwerze. Administrator musi dodać klucze dostawcy.", connect: "Połącz", reconnect: "Połącz ponownie", disconnect: "Rozłącz", connected: "Połączono", off: "Wyłączone",
    justConnected: "{name}: połączono.", failed: "Połączenie nie zostało dokończone ({code}).",
    google: { title: "Kalendarz Google", hint: "Wydarzenia utworzone tutaj trafiają do Twojego Kalendarza Google, na życzenie z linkiem Meet. Zmiany i usunięcia w Google wracają tutaj.", sync: "Synchronizuj teraz", polling: "Zmiany są sprawdzane co kilka minut." },
    slack: { title: "Slack", hint: "Nowe leady, wygrane szanse, czerwone projekty i zakończone sprinty trafiają na kanał.", adminOnly: "Slacka konfigurują tylko właściciele i administratorzy.", loadChannels: "Wczytaj kanały", nowhere: "Nigdzie", event: { lead: "Nowy lead", deal_won: "Wygrana szansa", project_red: "Projekt robi się czerwony", sprint_ended: "Koniec sprintu" } },
    telegram: { title: "Telegram", hint: "Powiadomienia w Telegramie oraz polecenia /today, /task, /done i /lead z czatu.", link: "Utwórz kod połączenia", open: "Otwórz @{bot} i naciśnij Start", manual: "W Telegramie wyślij /start {code} do @{bot}.", expires: "Kod działa 15 minut.", check: "Nacisnąłem Start", commands: "Wyślij botowi /help, aby zobaczyć polecenia." },
  },
};
const fragment = { en, ru, pl };
export default fragment;
