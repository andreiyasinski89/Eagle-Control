# Проверка приложения в Google (убрать «Эксперты Google не проверяли это приложение»)

Это предупреждение Google показывает любому приложению, которое просит доступ к календарю и ещё не прошло проверку. Мы просим самый узкий доступ — `calendar.events` («чувствительный», не «ограниченный»): проверка обычная, без платного аудита, от нескольких дней до пары недель. Всё делается под тем Google-аккаунтом, которым создан проект в Google Cloud.

**Что уже сделано в коде (0.69.0):** публичная главная страница `https://mlmcrm.app` с описанием и ссылками на политики (раньше гость сразу попадал на вход); раздел «Google user data» в политике конфиденциальности с обязательной фразой о Limited Use; отключение календаря отзывает доступ и в самом Google.

**Пока идёт проверка** вы можете пользоваться календарём: на предупреждении «Дополнительные настройки» → «Перейти на страницу mlmcrm.app (небезопасно)». В **Google Auth Platform → Audience** статус должен быть **In production** (в режиме Testing Google отключает подключение через 7 дней). До проверки так могут подключиться до 100 человек.

---

## Шаг 1. Подтвердить домен mlmcrm.app (≈10 минут)

1. Откройте **search.google.com/search-console** → **Добавить ресурс** → левый вариант **«Доменный ресурс»** → впишите `mlmcrm.app` → **Продолжить**.
2. Скопируйте запись вида `google-site-verification=…` (кнопка **Копировать**).
3. **Vercel** → вверху раздел **Domains** (домены команды, не проект) → **mlmcrm.app** → **DNS Records** → **Add**:
   - **Type:** `TXT`
   - **Name:** пусто (или `@`)
   - **Value:** вставьте скопированное → **Add**.
4. В Search Console нажмите **Подтвердить**. Не вышло — повторите через 10–30 минут.

## Шаг 2. Оформление — Google Auth Platform → Branding

console.cloud.google.com → ваш проект → **Google Auth Platform → Branding**:

| Поле | Значение |
|---|---|
| App name | `MLM CRM` |
| User support email | ваша почта |
| App logo | `mlmcrm-logo-120.png` (120×120, в папке Документы\MLM-CRM) |
| Application home page | `https://mlmcrm.app` |
| Application privacy policy link | `https://mlmcrm.app/legal/privacy` |
| Application terms of service link | `https://mlmcrm.app/legal/terms` |
| Authorized domains | `mlmcrm.app` |
| Developer contact information | ваша почта |

**Save.**

## Шаг 3. Доступ к данным — Google Auth Platform → Data Access

Оставьте **одну** чувствительную строку: `https://www.googleapis.com/auth/calendar.events` (лишние строки календаря удалите; `openid` и `email` — обычные, их оставить). В поле обоснования вставьте:

> MLM CRM is a CRM for network marketers. When a user connects Google Calendar, the meetings and calls they schedule with their contacts in MLM CRM are created, updated and deleted as events in the user's own primary Google Calendar, and changes the user makes to those events in Google Calendar are synced back, so the user keeps one schedule. So that the user sees their whole day in one place, the user's other events (title, time and link, from about a month back to three months ahead) are also shown in the user's own MLM CRM calendar, visible only to that user and replaced at every sync; disconnecting deletes them. We do not share calendar data with third parties, do not use it for advertising or AI training. The calendar.events scope is the narrowest scope that allows creating and updating events; the user can disconnect at any time, which also revokes the token at Google.

## Шаг 4. Видео (3–5 минут, YouTube «Доступ по ссылке»)

Запишите экран (Win+G или OBS). Голос не обязателен; можно подписывать шаги по-английски.

1. Откройте `https://mlmcrm.app` — покажите главную страницу и ссылку на Privacy policy внизу.
2. Войдите в аккаунт.
3. **Settings → Integrations → Google Calendar → Connect.**
4. **Экран согласия Google:** покажите **адресную строку** целиком (в ней виден ваш Client ID), название **MLM CRM** и строку доступа к календарю. Нажмите **Allow / Разрешить**.
5. В MLM CRM откройте карточку человека → **Встреча → Завтра 12:00**.
6. Откройте Google Календарь в соседней вкладке — встреча там (появляется за несколько секунд; если нет — обновите страницу календаря).
7. (Можно пропустить) Измените время этой встречи в Google Календаре и через минуту-две обновите MLM CRM — время поменяется. Если сразу не поменялось, этот шаг просто не включайте в видео.
8. **Settings → Integrations → Disconnect** — покажите, что календарь отключён.

Загрузите на YouTube с доступом **«Доступ по ссылке»**, скопируйте ссылку.

## Шаг 5. Отправить на проверку

**Google Auth Platform → Verification Center** (или **Audience → Prepare for verification**) → проверьте данные → вставьте ссылку на видео → **Submit**.

Google пишет на вашу почту. Если попросят что-то исправить, пришлите мне текст письма — исправим.

## Частые причины отказа и что делать

- **«Homepage does not explain the app» / «requires login»** — с 0.69.0 главная публичная; если всё равно отказали, пришлите письмо.
- **«Privacy policy does not disclose Google user data»** — раздел есть: `https://mlmcrm.app/legal/privacy#google`.
- **«Video does not show the OAuth consent screen with the client ID»** — перезапишите шаг 4 видео, крупно показав адресную строку.
- **«Domain not verified»** — повторите шаг 1, затем снова Submit.
