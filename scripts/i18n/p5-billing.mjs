const en = {
  nav: { billing: "Billing" },
  notifications: { kind: { billing: "Billing and plan changes" } },
  billing: {
    title: "Plan and billing", error: "Something went wrong", plan: "Current plan", plans: { FREE: "Free", PRO: "Pro", ENTERPRISE: "Enterprise" },
    upgrade: "Upgrade to Pro", manage: "Manage subscription", renewsOn: "Renews on {date}", endsOn: "Ends on {date}", limits: "Usage", unlimited: "{n} (no limit)",
    limit: { users: "People", projects: "Projects", pipelines: "Pipelines", contacts: "Contacts" },
    waiting: "Waiting for the payment confirmation from Stripe…", thanks: "Thank you. Your plan is updated.",
    pastDue: "The last payment failed. Update your card by {date} to keep Pro.", graceExpired: "The payment was not received in time; the workspace is on the Free plan. Nothing was deleted.",
    notConfigured: "Billing is not configured on this server.", ownerOnly: "Only the workspace owner can change the plan.",
  },
};
const ru = {
  nav: { billing: "Оплата" },
  notifications: { kind: { billing: "Оплата и смена тарифа" } },
  billing: {
    title: "Тариф и оплата", error: "Что-то пошло не так", plan: "Текущий тариф", plans: { FREE: "Free", PRO: "Pro", ENTERPRISE: "Enterprise" },
    upgrade: "Перейти на Pro", manage: "Управление подпиской", renewsOn: "Продление {date}", endsOn: "Действует до {date}", limits: "Использование", unlimited: "{n} (без ограничений)",
    limit: { users: "Люди", projects: "Проекты", pipelines: "Воронки", contacts: "Контакты" },
    waiting: "Ждём подтверждения оплаты от Stripe…", thanks: "Спасибо. Тариф обновлён.",
    pastDue: "Последний платёж не прошёл. Обновите карту до {date}, чтобы сохранить Pro.", graceExpired: "Платёж не поступил вовремя, пространство на тарифе Free. Ничего не удалено.",
    notConfigured: "Оплата не настроена на этом сервере.", ownerOnly: "Менять тариф может только владелец пространства.",
  },
};
const pl = {
  nav: { billing: "Płatności" },
  notifications: { kind: { billing: "Płatności i zmiany planu" } },
  billing: {
    title: "Plan i płatności", error: "Coś poszło nie tak", plan: "Aktualny plan", plans: { FREE: "Free", PRO: "Pro", ENTERPRISE: "Enterprise" },
    upgrade: "Przejdź na Pro", manage: "Zarządzaj subskrypcją", renewsOn: "Odnowienie {date}", endsOn: "Kończy się {date}", limits: "Wykorzystanie", unlimited: "{n} (bez limitu)",
    limit: { users: "Osoby", projects: "Projekty", pipelines: "Lejki", contacts: "Kontakty" },
    waiting: "Czekamy na potwierdzenie płatności od Stripe…", thanks: "Dziękujemy. Plan został zaktualizowany.",
    pastDue: "Ostatnia płatność nie powiodła się. Zaktualizuj kartę do {date}, aby zachować Pro.", graceExpired: "Płatność nie wpłynęła na czas, przestrzeń ma plan Free. Nic nie usunięto.",
    notConfigured: "Płatności nie są skonfigurowane na tym serwerze.", ownerOnly: "Plan może zmienić tylko właściciel przestrzeni.",
  },
};
const fragment = { en, ru, pl };
export default fragment;
