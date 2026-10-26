const en = {
  reports: {
    title: "Reports", tab: { agile: "Agile metrics", crm: "CRM" }, nothing: "You have no reports available.",
    paywallTitle: "Reports are part of the Pro plan", paywallAgile: "Velocity, burndown, cumulative flow, cycle time and throughput for every project.", paywallCrm: "Sales funnel, weighted forecast, win/loss reasons, lead sources and manager activity.", paywallHint: "Ask a workspace owner to upgrade the plan.",
    project: "Project", noProjects: "There are no projects yet.", noData: "No data yet.", days: "{n} d", daysRange: "{from}–{to} d", daysOver: "{n}+ d",
    avgVelocity: "Average velocity", avgVelocityHint: "last 3 finished sprints", cycleMedian: "Cycle time (median)", cycleSample: "{n} finished tasks", cycleP85: "Cycle time (85%)", cycleP95: "95%: {n} d", thisWeek: "Done this week", tasksDone: "Tasks done",
    velocity: "Velocity", velocityHint: "Work committed to a sprint vs. finished by its due date", committed: "Committed", completed: "Completed",
    burndown: "Burndown", burndownHint: "Remaining work per day against the ideal line", sprint: "Sprint", ideal: "Ideal", remaining: "Remaining",
    flow: "Cumulative flow", flowHint: "Tasks per status at the end of each day", throughput: "Throughput", throughputHint: "Tasks finished per week",
    cycleTime: "Cycle time", cycleHint: "Days from first move into progress to done",
    from: "From", to: "To", pipeline: "Pipeline: {name}", csvOf: "Export {section} as CSV",
    winRate: "Win rate", wonLost: "{won} won · {lost} lost", wonAmount: "Won", lostAmount: "Lost", avgCycle: "Average sales cycle", medianCycle: "median {n} d",
    funnel: "Funnel", funnelHint: "Deals that entered each stage in the period, with conversion from the previous stage", lostInPeriod: "{n, plural, one {# deal} other {# deals}} lost in this period.",
    forecast: "Forecast", forecastHint: "Open deals by expected close month; weighted by probability", total: "Total", weighted: "Weighted", noDate: "No date",
    winLoss: "Why deals are lost", reasons: "Lost reasons, most common first", sources: "Lead sources", source: "Source", deals: "Deals", won: "Won", conversion: "Conversion",
    managers: "Manager activity", managersHint: "Completed activities and won deals in the period", manager: "Manager", calls: "Calls", emails: "E-mails", meetings: "Meetings", notes: "Notes", tasksDone: "Tasks", dealsWon: "Deals won",
  },
};
const ru = {
  reports: {
    title: "Отчёты", tab: { agile: "Agile-метрики", crm: "CRM" }, nothing: "Нет доступных отчётов.",
    paywallTitle: "Отчёты входят в тариф Pro", paywallAgile: "Скорость, burndown, кумулятивный поток, время цикла и пропускная способность по каждому проекту.", paywallCrm: "Воронка продаж, прогноз с учётом вероятности, причины проигрышей, источники лидов и активность менеджеров.", paywallHint: "Попросите владельца рабочего пространства сменить тариф.",
    project: "Проект", noProjects: "Проектов пока нет.", noData: "Данных пока нет.", days: "{n} дн.", daysRange: "{from}–{to} дн.", daysOver: "{n}+ дн.",
    avgVelocity: "Средняя скорость", avgVelocityHint: "последние 3 завершённых спринта", cycleMedian: "Время цикла (медиана)", cycleSample: "завершённых задач: {n}", cycleP85: "Время цикла (85%)", cycleP95: "95%: {n} дн.", thisWeek: "Сделано на этой неделе", tasksDone: "Задач выполнено",
    velocity: "Скорость", velocityHint: "Объём работы в спринте и сделанное к его сроку", committed: "Запланировано", completed: "Выполнено",
    burndown: "Burndown", burndownHint: "Остаток работы по дням относительно идеальной линии", sprint: "Спринт", ideal: "Идеал", remaining: "Остаток",
    flow: "Кумулятивный поток", flowHint: "Задачи по статусам на конец каждого дня", throughput: "Пропускная способность", throughputHint: "Задач завершено за неделю",
    cycleTime: "Время цикла", cycleHint: "Дни от первого перехода в работу до готово",
    from: "С", to: "По", pipeline: "Воронка: {name}", csvOf: "Выгрузить {section} в CSV",
    winRate: "Доля выигранных", wonLost: "выиграно {won} · проиграно {lost}", wonAmount: "Выиграно", lostAmount: "Проиграно", avgCycle: "Средний цикл продажи", medianCycle: "медиана {n} дн.",
    funnel: "Воронка", funnelHint: "Сделки, вошедшие в каждый этап за период, и конверсия с предыдущего этапа", lostInPeriod: "Проиграно за период: {n}.",
    forecast: "Прогноз", forecastHint: "Открытые сделки по месяцу ожидаемого закрытия; с учётом вероятности", total: "Сумма", weighted: "Взвешенная", noDate: "Без даты",
    winLoss: "Почему проигрываем", reasons: "Причины проигрышей, частые первыми", sources: "Источники лидов", source: "Источник", deals: "Сделок", won: "Выиграно", conversion: "Конверсия",
    managers: "Активность менеджеров", managersHint: "Завершённые активности и выигранные сделки за период", manager: "Менеджер", calls: "Звонки", emails: "Письма", meetings: "Встречи", notes: "Заметки", tasksDone: "Задачи", dealsWon: "Выиграно сделок",
  },
};
const pl = {
  reports: {
    title: "Raporty", tab: { agile: "Metryki Agile", crm: "CRM" }, nothing: "Brak dostępnych raportów.",
    paywallTitle: "Raporty są częścią planu Pro", paywallAgile: "Prędkość, burndown, skumulowany przepływ, czas cyklu i przepustowość dla każdego projektu.", paywallCrm: "Lejek sprzedaży, prognoza ważona prawdopodobieństwem, powody przegranych, źródła leadów i aktywność handlowców.", paywallHint: "Poproś właściciela przestrzeni o zmianę planu.",
    project: "Projekt", noProjects: "Nie ma jeszcze projektów.", noData: "Brak danych.", days: "{n} dn.", daysRange: "{from}–{to} dn.", daysOver: "{n}+ dn.",
    avgVelocity: "Średnia prędkość", avgVelocityHint: "ostatnie 3 zakończone sprinty", cycleMedian: "Czas cyklu (mediana)", cycleSample: "zakończonych zadań: {n}", cycleP85: "Czas cyklu (85%)", cycleP95: "95%: {n} dn.", thisWeek: "Zrobione w tym tygodniu", tasksDone: "Zadania wykonane",
    velocity: "Prędkość", velocityHint: "Praca w sprincie i ukończona do jego terminu", committed: "Zaplanowane", completed: "Ukończone",
    burndown: "Burndown", burndownHint: "Pozostała praca dzień po dniu na tle linii idealnej", sprint: "Sprint", ideal: "Idealna", remaining: "Pozostało",
    flow: "Skumulowany przepływ", flowHint: "Zadania według statusu na koniec każdego dnia", throughput: "Przepustowość", throughputHint: "Zadania ukończone w tygodniu",
    cycleTime: "Czas cyklu", cycleHint: "Dni od pierwszego przejścia do realizacji do zakończenia",
    from: "Od", to: "Do", pipeline: "Lejek: {name}", csvOf: "Eksportuj {section} do CSV",
    winRate: "Skuteczność", wonLost: "wygrane {won} · przegrane {lost}", wonAmount: "Wygrane", lostAmount: "Przegrane", avgCycle: "Średni cykl sprzedaży", medianCycle: "mediana {n} dn.",
    funnel: "Lejek", funnelHint: "Szanse, które weszły do każdego etapu w okresie, z konwersją z poprzedniego etapu", lostInPeriod: "Przegranych w okresie: {n}.",
    forecast: "Prognoza", forecastHint: "Otwarte szanse wg miesiąca oczekiwanego zamknięcia; ważone prawdopodobieństwem", total: "Suma", weighted: "Ważona", noDate: "Bez daty",
    winLoss: "Dlaczego przegrywamy", reasons: "Powody przegranych, najczęstsze pierwsze", sources: "Źródła leadów", source: "Źródło", deals: "Szanse", won: "Wygrane", conversion: "Konwersja",
    managers: "Aktywność handlowców", managersHint: "Zakończone aktywności i wygrane szanse w okresie", manager: "Handlowiec", calls: "Rozmowy", emails: "E-maile", meetings: "Spotkania", notes: "Notatki", tasksDone: "Zadania", dealsWon: "Wygrane szanse",
  },
};
const fragment = { en, ru, pl };
export default fragment;
