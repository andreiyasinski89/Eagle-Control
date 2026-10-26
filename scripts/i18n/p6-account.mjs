const en = {
  nav: { account: "Account" },
  portal: { account: "Account" },
  members: { makeOwner: "Make owner", makeOwnerConfirm: "Make {name} the owner? You will become an admin." },
  account: {
    title: "Your account", error: "Something went wrong", back: "Back to the app", signOut: "Sign out", sendCode: "E-mail me a code", code: "Confirmation code", codeSent: "We sent a 6-digit code to {to}. It works for 10 minutes.",
    exportTitle: "Download your data", exportHint: "A JSON file with your profile, what you created and wrote, your time entries, settings and activity. Other people's content and secrets are not included.", download: "Download", exported: "Your data was downloaded.",
    deleteTitle: "Delete your account", deleteHint: "Your sign-in, sessions, integrations, API tokens, notifications and memberships are erased. You can cancel for {days, plural, =0 {no time} one {# day} other {# days}} after asking.",
    handOver: "You are the only owner of these workspaces. Make someone else the owner first:", candidates: "{n, plural, one {# person can take over} other {# people can take over}}",
    willDelete: "These workspaces have no one else on the team and will be deleted with all their projects, CRM data and files:", clientsLose: "{n, plural, one {# client loses} other {# clients lose}} access",
    youLeave: "You will leave: {names}.", whatStays: "Tasks, comments and time entries you made in other people's workspaces stay, shown as “Deleted user”. Your name and e-mail are removed from them.",
    removeComments: "Also remove the text of my comments and delete the files I uploaded", typeEmail: "Type your e-mail address to confirm", deleteAccount: "Delete my account for good",
    scheduled: "Your account will be deleted on {date}. Until then you can cancel.", deletingNow: "Your account is being deleted.", cancelDeletion: "Keep my account",
    bannerText: "Your account will be deleted on {date}.", bannerCancel: "Cancel deletion",
  },
};
const ru = {
  nav: { account: "Аккаунт" },
  portal: { account: "Аккаунт" },
  members: { makeOwner: "Сделать владельцем", makeOwnerConfirm: "Сделать {name} владельцем? Вы станете администратором." },
  account: {
    title: "Ваш аккаунт", error: "Что-то пошло не так", back: "Вернуться в приложение", signOut: "Выйти", sendCode: "Отправить код на почту", code: "Код подтверждения", codeSent: "Мы отправили 6-значный код на {to}. Он действует 10 минут.",
    exportTitle: "Скачать мои данные", exportHint: "JSON-файл с профилем, тем, что вы создали и написали, записями времени, настройками и действиями. Чужие материалы и секреты не включены.", download: "Скачать", exported: "Ваши данные скачаны.",
    deleteTitle: "Удалить аккаунт", deleteHint: "Вход, сессии, интеграции, API-токены, уведомления и членства будут удалены. Передумать можно в течение {days, plural, =0 {нескольких минут} one {# дня} few {# дней} many {# дней} other {# дня}} после запроса.",
    handOver: "Вы единственный владелец этих пространств. Сначала назначьте другого владельца:", candidates: "{n, plural, one {# человек может принять} few {# человека могут принять} many {# человек могут принять} other {# человека могут принять}}",
    willDelete: "В этих пространствах больше нет команды, они будут удалены со всеми проектами, данными CRM и файлами:", clientsLose: "{n, plural, one {# клиент потеряет} few {# клиента потеряют} many {# клиентов потеряют} other {# клиента потеряют}} доступ",
    youLeave: "Вы выйдете из: {names}.", whatStays: "Задачи, комментарии и записи времени, сделанные вами в чужих пространствах, останутся с подписью «Deleted user». Ваше имя и e-mail из них будут убраны.",
    removeComments: "Также убрать текст моих комментариев и удалить загруженные мной файлы", typeEmail: "Введите свой e-mail для подтверждения", deleteAccount: "Удалить аккаунт навсегда",
    scheduled: "Аккаунт будет удалён {date}. До этого можно отменить.", deletingNow: "Аккаунт удаляется.", cancelDeletion: "Оставить аккаунт",
    bannerText: "Ваш аккаунт будет удалён {date}.", bannerCancel: "Отменить удаление",
  },
};
const pl = {
  nav: { account: "Konto" },
  portal: { account: "Konto" },
  members: { makeOwner: "Zrób właścicielem", makeOwnerConfirm: "Zrobić {name} właścicielem? Zostaniesz administratorem." },
  account: {
    title: "Twoje konto", error: "Coś poszło nie tak", back: "Wróć do aplikacji", signOut: "Wyloguj", sendCode: "Wyślij kod na e-mail", code: "Kod potwierdzający", codeSent: "Wysłaliśmy 6-cyfrowy kod na {to}. Działa 10 minut.",
    exportTitle: "Pobierz swoje dane", exportHint: "Plik JSON z profilem, tym, co utworzyłeś i napisałeś, wpisami czasu, ustawieniami i aktywnością. Treści innych osób i sekrety nie są dołączone.", download: "Pobierz", exported: "Twoje dane zostały pobrane.",
    deleteTitle: "Usuń konto", deleteHint: "Logowanie, sesje, integracje, tokeny API, powiadomienia i członkostwa zostaną usunięte. Możesz zmienić zdanie przez {days, plural, =0 {kilka minut} one {# dzień} few {# dni} many {# dni} other {# dnia}} od prośby.",
    handOver: "Jesteś jedynym właścicielem tych przestrzeni. Najpierw wskaż innego właściciela:", candidates: "{n, plural, one {# osoba może przejąć} few {# osoby mogą przejąć} many {# osób może przejąć} other {# osoby mogą przejąć}}",
    willDelete: "W tych przestrzeniach nie ma już nikogo z zespołu; zostaną usunięte razem z projektami, danymi CRM i plikami:", clientsLose: "{n, plural, one {# klient straci} few {# klientów straci} many {# klientów straci} other {# klienta straci}} dostęp",
    youLeave: "Opuścisz: {names}.", whatStays: "Zadania, komentarze i wpisy czasu, które utworzyłeś w cudzych przestrzeniach, zostaną jako „Deleted user”. Twoje imię i e-mail zostaną z nich usunięte.",
    removeComments: "Usuń też treść moich komentarzy i pliki, które przesłałem", typeEmail: "Wpisz swój adres e-mail, aby potwierdzić", deleteAccount: "Usuń konto na zawsze",
    scheduled: "Konto zostanie usunięte {date}. Do tego czasu możesz anulować.", deletingNow: "Konto jest usuwane.", cancelDeletion: "Zachowaj konto",
    bannerText: "Twoje konto zostanie usunięte {date}.", bannerCancel: "Anuluj usunięcie",
  },
};
const fragment = { en, ru, pl };
export default fragment;
