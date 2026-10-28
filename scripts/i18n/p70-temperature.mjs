const f = (o, a) => ({ crm: o, admin: a });
const fragment = {
  en: f(
    { tempAuto: "Worked out from touches, replies and meetings. Tap a temperature to set it yourself.", tempManual: "Set by you until {date}; then it is worked out again.", tempBackToAuto: "Work it out for me", tempBadgeManual: "set by hand" },
    { recomputeTemperatures: "Recalculate temperatures", temperaturesRecomputed: "Temperatures recalculated: {changed} of {checked} people changed." },
  ),
  ru: f(
    { tempAuto: "Считается по касаниям, ответам и встречам. Нажмите на значение, чтобы выставить своё.", tempManual: "Выставлено вами до {date}; потом посчитаем заново.", tempBackToAuto: "Посчитать за меня", tempBadgeManual: "вручную" },
    { recomputeTemperatures: "Пересчитать температуры", temperaturesRecomputed: "Температуры пересчитаны: изменилось {changed} из {checked} человек." },
  ),
  pl: f(
    { tempAuto: "Liczone z kontaktów, odpowiedzi i spotkań. Dotknij wartości, aby ustawić własną.", tempManual: "Ustawione przez Ciebie do {date}; potem zostanie policzone na nowo.", tempBackToAuto: "Policz za mnie", tempBadgeManual: "ręcznie" },
    { recomputeTemperatures: "Przelicz temperatury", temperaturesRecomputed: "Temperatury przeliczone: zmieniło się {changed} z {checked} osób." },
  ),
  uk: f(
    { tempAuto: "Рахується за дотиками, відповідями та зустрічами. Натисніть значення, щоб виставити своє.", tempManual: "Виставлено вами до {date}; потім порахуємо заново.", tempBackToAuto: "Порахувати за мене", tempBadgeManual: "вручну" },
    { recomputeTemperatures: "Перерахувати температури", temperaturesRecomputed: "Температури перераховано: змінилося {changed} із {checked} людей." },
  ),
};
export default fragment;
