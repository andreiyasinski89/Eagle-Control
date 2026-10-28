import type { SignupLocale } from "@/modules/auth/signup";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** The e-mail with the sign-in link, in the language the person was using on the page. */
export function signInMail(locale: SignupLocale, link: string): { subject: string; text: string; html: string } {
  const t = {
    en: { subject: "Sign in to MeetOwl", lead: "Click to sign in to MeetOwl", button: "Sign in", note: "The link works once and expires in 15 minutes. If you did not ask for it, ignore this e-mail: nobody can sign in without it." },
    ru: { subject: "Вход в MeetOwl", lead: "Нажмите, чтобы войти в MeetOwl", button: "Войти", note: "Ссылка работает один раз и действует 15 минут. Если вы её не запрашивали, просто проигнорируйте письмо: без неё войти нельзя." },
    uk: { subject: "Вхід до MeetOwl", lead: "Натисніть, щоб увійти до MeetOwl", button: "Увійти", note: "Посилання працює один раз і діє 15 хвилин. Якщо ви його не запитували, просто проігноруйте лист: без нього увійти неможливо." },
    pl: { subject: "Logowanie do MeetOwl", lead: "Kliknij, aby zalogować się do MeetOwl", button: "Zaloguj się", note: "Link działa jeden raz i wygasa po 15 minutach. Jeśli o niego nie prosiłeś, zignoruj tę wiadomość: bez niego nikt się nie zaloguje." },
  }[locale];
  return {
    subject: t.subject,
    text: `${t.lead}: ${link}\n\n${t.note}`,
    html: `<p>${t.lead}:</p><p><a href="${esc(link)}">${t.button}</a></p><p>${t.note}</p>`,
  };
}

/** Sent once, when the person has made their first workspace: where to begin. */
export function welcomeMail(locale: SignupLocale, name: string | null, workspace: string, startUrl: string): { subject: string; text: string; html: string } {
  const t = {
    en: {
      subject: "Welcome to MeetOwl",
      hi: name ? `Hello, ${name}!` : "Hello!",
      intro: `Your workspace “${workspace}” is ready. Three steps to begin:`,
      steps: ["Write down your dream and goal: it is the measure of the distance you cover.", "Add the people you know: paste a list of names, no need to fill anything else.", "Plan the next step for each: a day, a call, a message."],
      button: "Open Getting started",
      outro: "The Knowledge base has a short guide for every step.",
    },
    ru: {
      subject: "Добро пожаловать в MeetOwl",
      hi: name ? `Здравствуйте, ${name}!` : "Здравствуйте!",
      intro: `Ваше пространство «${workspace}» готово. Три шага, чтобы начать:`,
      steps: ["Запишите мечту и цель: по ним считается пройденное расстояние.", "Добавьте людей, которых знаете: вставьте список имён, остальное заполнять не нужно.", "Назначьте каждому следующий шаг: день, звонок, сообщение."],
      button: "Открыть «Старт»",
      outro: "В «Базе знаний» есть короткий гайд по каждому шагу.",
    },
    uk: {
      subject: "Ласкаво просимо до MeetOwl",
      hi: name ? `Вітаємо, ${name}!` : "Вітаємо!",
      intro: `Ваш простір «${workspace}» готовий. Три кроки, щоб почати:`,
      steps: ["Запишіть мрію і ціль: за ними рахується пройдена відстань.", "Додайте людей, яких знаєте: вставте список імен, решту заповнювати не потрібно.", "Призначте кожному наступний крок: день, дзвінок, повідомлення."],
      button: "Відкрити «Старт»",
      outro: "У «Базі знань» є короткий гайд до кожного кроку.",
    },
    pl: {
      subject: "Witaj w MeetOwl",
      hi: name ? `Cześć, ${name}!` : "Cześć!",
      intro: `Twoja przestrzeń „${workspace}” jest gotowa. Trzy kroki na początek:`,
      steps: ["Zapisz marzenie i cel: od nich liczy się przebyty dystans.", "Dodaj ludzi, których znasz: wklej listę imion, reszty nie trzeba wypełniać.", "Zaplanuj każdemu następny krok: dzień, rozmowę, wiadomość."],
      button: "Otwórz „Start”",
      outro: "W Bazie wiedzy jest krótki poradnik do każdego kroku.",
    },
  }[locale];
  return {
    subject: t.subject,
    text: `${t.hi}\n\n${t.intro}\n${t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n${t.button}: ${startUrl}\n\n${t.outro}`,
    html: `<p>${esc(t.hi)}</p><p>${esc(t.intro)}</p><ol>${t.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><p><a href="${esc(startUrl)}">${esc(t.button)}</a></p><p>${esc(t.outro)}</p>`,
  };
}
