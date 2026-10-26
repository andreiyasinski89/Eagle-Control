const fragment = {
  en: {
    auth: {
      terms: "I agree to the <terms>terms</terms> and the <privacy>privacy policy</privacy>",
      sendFailed: "We could not send the link. Check the address and try again later.",
      confirmTitle: "Confirm sign-in",
      confirmHint: "Press the button to finish signing in. The link works once.",
      confirmInvalid: "This sign-in link is not valid. Ask for a new one on the sign-in page.",
      confirmButton: "Sign in",
    },
    legal: { back: "Back to sign in", draft: "Draft text: have it reviewed by a lawyer before you rely on it.", operator: "Responsible for the service", operatorMissing: "(not set yet)", privacy: "Privacy policy", terms: "Terms of use" },
    billing: { granted: "Pro was granted to this workspace by the administrator." },
  },
  ru: {
    auth: {
      terms: "Я согласен с <terms>условиями использования</terms> и <privacy>политикой конфиденциальности</privacy>",
      sendFailed: "Не удалось отправить ссылку. Проверьте адрес и попробуйте позже.",
      confirmTitle: "Подтвердите вход",
      confirmHint: "Нажмите кнопку, чтобы завершить вход. Ссылка работает один раз.",
      confirmInvalid: "Эта ссылка для входа недействительна. Запросите новую на странице входа.",
      confirmButton: "Войти",
    },
    legal: { back: "Назад ко входу", draft: "Черновик: прежде чем на него полагаться, покажите его юристу.", operator: "Ответственный за сервис", operatorMissing: "(пока не указан)", privacy: "Политика конфиденциальности", terms: "Условия использования" },
    billing: { granted: "План Pro выдан этому пространству администратором." },
  },
  pl: {
    auth: {
      terms: "Akceptuję <terms>regulamin</terms> i <privacy>politykę prywatności</privacy>",
      sendFailed: "Nie udało się wysłać linku. Sprawdź adres i spróbuj później.",
      confirmTitle: "Potwierdź logowanie",
      confirmHint: "Naciśnij przycisk, aby dokończyć logowanie. Link działa tylko raz.",
      confirmInvalid: "Ten link logowania jest nieprawidłowy. Poproś o nowy na stronie logowania.",
      confirmButton: "Zaloguj się",
    },
    legal: { back: "Wróć do logowania", draft: "Wersja robocza: zanim na niej polegasz, pokaż ją prawnikowi.", operator: "Odpowiedzialny za usługę", operatorMissing: "(jeszcze nie podano)", privacy: "Polityka prywatności", terms: "Regulamin" },
    billing: { granted: "Plan Pro został przyznany tej przestrzeni przez administratora." },
  },
};
export default fragment;
