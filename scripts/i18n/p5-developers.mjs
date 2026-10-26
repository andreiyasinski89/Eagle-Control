const en = {
  nav: { developers: "Developers" },
  developers: {
    title: "API and webhooks", docs: "OpenAPI document", error: "Something went wrong", done: "I saved it",
    paywallTitle: "The API is part of the Pro plan", paywallText: "Personal access tokens and signed webhooks.",
    tokens: "Access tokens", tokensHint: "A token acts as you inside this workspace, with the rights you have. Send it as Authorization: Bearer YOUR_TOKEN.",
    name: "Name", scope: "Access", read: "Read only", write: "Read and write", expiresDays: "Expires (days)", create: "Create token",
    tokenOnce: "Copy your token now. It is shown only once.", lastUsed: "last used {date}", expires: "expires {date}", noExpiry: "never expires", revoke: "Revoke", noTokens: "No tokens yet.",
    webhooks: "Webhooks", webhooksHint: "MeetOwl sends signed JSON to your https URL (header MeetOwl-Signature: t=…,v1=HMAC-SHA256 of \"t.body\"). Failed deliveries are retried for about 15 hours.",
    secretOnce: "Copy the signing secret now. It is shown only once.", add: "Add endpoint", test: "Send test", pause: "Pause", resume: "Resume", remove: "Remove", failed: "{n} failed", noHooks: "No endpoints yet.",
  },
};
const ru = {
  nav: { developers: "Разработчикам" },
  developers: {
    title: "API и вебхуки", docs: "Документ OpenAPI", error: "Что-то пошло не так", done: "Я сохранил",
    paywallTitle: "API входит в тариф Pro", paywallText: "Персональные токены доступа и вебхуки с подписью.",
    tokens: "Токены доступа", tokensHint: "Токен действует от вашего имени в этом пространстве и с вашими правами. Передавайте его как Authorization: Bearer YOUR_TOKEN.",
    name: "Название", scope: "Доступ", read: "Только чтение", write: "Чтение и запись", expiresDays: "Срок (дней)", create: "Создать токен",
    tokenOnce: "Скопируйте токен сейчас. Он показывается один раз.", lastUsed: "использован {date}", expires: "до {date}", noExpiry: "бессрочный", revoke: "Отозвать", noTokens: "Токенов пока нет.",
    webhooks: "Вебхуки", webhooksHint: "MeetOwl отправляет подписанный JSON на ваш https-адрес (заголовок MeetOwl-Signature: t=…,v1=HMAC-SHA256 от «t.тело»). Неудачные доставки повторяются около 15 часов.",
    secretOnce: "Скопируйте секрет подписи сейчас. Он показывается один раз.", add: "Добавить адрес", test: "Тест", pause: "Пауза", resume: "Возобновить", remove: "Удалить", failed: "ошибок: {n}", noHooks: "Адресов пока нет.",
  },
};
const pl = {
  nav: { developers: "Dla programistów" },
  developers: {
    title: "API i webhooki", docs: "Dokument OpenAPI", error: "Coś poszło nie tak", done: "Zapisałem",
    paywallTitle: "API jest częścią planu Pro", paywallText: "Osobiste tokeny dostępu i podpisane webhooki.",
    tokens: "Tokeny dostępu", tokensHint: "Token działa w Twoim imieniu w tej przestrzeni i z Twoimi uprawnieniami. Wysyłaj go jako Authorization: Bearer YOUR_TOKEN.",
    name: "Nazwa", scope: "Dostęp", read: "Tylko odczyt", write: "Odczyt i zapis", expiresDays: "Ważny (dni)", create: "Utwórz token",
    tokenOnce: "Skopiuj token teraz. Jest pokazywany tylko raz.", lastUsed: "użyty {date}", expires: "do {date}", noExpiry: "bezterminowy", revoke: "Unieważnij", noTokens: "Brak tokenów.",
    webhooks: "Webhooki", webhooksHint: "MeetOwl wysyła podpisany JSON na Twój adres https (nagłówek MeetOwl-Signature: t=…,v1=HMAC-SHA256 z „t.treść”). Nieudane dostawy są ponawiane przez około 15 godzin.",
    secretOnce: "Skopiuj sekret podpisu teraz. Jest pokazywany tylko raz.", add: "Dodaj adres", test: "Wyślij test", pause: "Wstrzymaj", resume: "Wznów", remove: "Usuń", failed: "błędów: {n}", noHooks: "Brak adresów.",
  },
};
const fragment = { en, ru, pl };
export default fragment;
