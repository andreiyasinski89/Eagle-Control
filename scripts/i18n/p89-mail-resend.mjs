const fragment = {
  en: {
    setup: {
      mailHint: { resend_wins: "RESEND_API_KEY is filled in and there is no Gmail mailbox beside it, so there is nothing to fall back on: the mail depends on the key and on the domain being verified in Resend. Keep the Gmail settings (SMTP_USER, SMTP_PASS) too: if Resend ever refuses, the mail goes through Gmail." },
      result: {
        mail_ok_resend: "A test e-mail was sent to {name} through Resend. Check the mailbox: if it is there, sign-in links will be sent too.",
        mail_fallback: "The test e-mail arrived, but through the Gmail mailbox: Resend refused it. Check the key and that the domain is verified in Resend (Domains). Resend said:",
      },
    },
  },
  ru: {
    setup: {
      mailHint: { resend_wins: "Заполнен RESEND_API_KEY, а ящика Gmail рядом нет, поэтому запасного пути нет: почта зависит от ключа и от подтверждённого домена в Resend. Оставьте и настройки Gmail (SMTP_USER, SMTP_PASS): если Resend откажет, письма уйдут через Gmail." },
      result: {
        mail_ok_resend: "Пробное письмо отправлено на {name} через Resend. Загляните в ящик: если оно там, ссылки для входа тоже уйдут.",
        mail_fallback: "Пробное письмо дошло, но через ящик Gmail: Resend его не принял. Проверьте ключ и то, что домен подтверждён в Resend (Domains). Resend ответил:",
      },
    },
  },
  pl: {
    setup: {
      mailHint: { resend_wins: "Wypełniony jest RESEND_API_KEY, a skrzynki Gmail obok nie ma, więc nie ma drogi zapasowej: poczta zależy od klucza i od zweryfikowanej domeny w Resend. Zostaw też ustawienia Gmail (SMTP_USER, SMTP_PASS): jeśli Resend odmówi, wiadomości pójdą przez Gmail." },
      result: {
        mail_ok_resend: "Testowy e-mail wysłano na {name} przez Resend. Zajrzyj do skrzynki: jeśli tam jest, linki do logowania też wyjdą.",
        mail_fallback: "Testowy e-mail dotarł, ale przez skrzynkę Gmail: Resend go nie przyjął. Sprawdź klucz i czy domena jest zweryfikowana w Resend (Domains). Resend odpowiedział:",
      },
    },
  },
  uk: {
    setup: {
      mailHint: { resend_wins: "Заповнено RESEND_API_KEY, а скриньки Gmail поруч немає, тому запасного шляху нема: пошта залежить від ключа і від підтвердженого домену в Resend. Залиште й налаштування Gmail (SMTP_USER, SMTP_PASS): якщо Resend відмовить, листи підуть через Gmail." },
      result: {
        mail_ok_resend: "Пробний лист надіслано на {name} через Resend. Загляньте в скриньку: якщо він там, посилання для входу теж підуть.",
        mail_fallback: "Пробний лист дійшов, але через скриньку Gmail: Resend його не прийняв. Перевірте ключ і те, що домен підтверджено в Resend (Domains). Resend відповів:",
      },
    },
  },
};
export default fragment;
