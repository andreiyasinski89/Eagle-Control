import type { Stage } from "./people";

/**
 * Ready texts for the messages of a person who builds a team: one or more for every stage of the funnel and a few for any moment.
 * They are a start, not a rule: each is copied into a messenger with the name filled in ({name}, {full_name}, {my_name}) and can be rewritten
 * in the Scripts tab. Square brackets mark what to put in by hand. No promises about income, no pressure: a person may always say no.
 */
export interface StarterScript {
  title: string;
  stage: Stage | null;
  body: string;
}
export type StarterLocale = "ru" | "en" | "pl" | "uk";

const RU: StarterScript[] = [
  {
    stage: "NEW",
    title: "Первое сообщение знакомому",
    body: "Привет, {name}! Это {my_name}. Давно не общались, как ты?\n\nУ меня появился новый проект, и мне хочется услышать твоё мнение: ты разбираешься в людях и в деле. Если интересно, расскажу коротко, минут на 10. Когда тебе удобно: сегодня вечером или завтра?",
  },
  {
    stage: "NEW",
    title: "Первое сообщение: по рекомендации",
    body: "Здравствуйте, {name}! Меня зовут {my_name}. Ваш контакт мне передал [кто порекомендовал], сказал, что вам может быть интересна тема [о чём: здоровье, дополнительный доход, новое дело].\n\nМогу в двух словах рассказать, что это, а вы сами решите, ваше это или нет. Удобно сейчас, или лучше в другое время?",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Выяснить, что важно человеку",
    body: "{name}, спасибо, что откликнулся! Чтобы не тратить твоё время зря, один вопрос: что для тебя сейчас важнее всего?\n\n1) дополнительный доход\n2) здоровье и самочувствие\n3) своё дело и развитие\n4) пока просто интересно, что это\n\nНапиши цифру или своими словами. Исходя из этого расскажу именно то, что может быть полезно тебе.",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Назначить разговор или презентацию",
    body: "{name}, давай я покажу всё наглядно, это проще, чем объяснять в переписке. Займёт 20–30 минут.\n\nМне удобно [день и время] или [другой день и время]. Какой вариант тебе подходит? Пришлю ссылку заранее.",
  },
  {
    stage: "WARMING",
    title: "Прогрев: полезный материал",
    body: "{name}, как и обещал(а), делюсь: [ссылка или материал: видео, история, отзыв]. Это 5 минут.\n\nПосмотри, когда будет время, и напиши, что откликнулось, а что вызвало вопросы. Завтра спрошу, как тебе.",
  },
  {
    stage: "WARMING",
    title: "Прогрев: вернуться к разговору",
    body: "{name}, привет! Вспомнил(а) про наш разговор. Как твои дела, получилось посмотреть материал?\n\nЕсли остались вопросы, давай разберём их по телефону или в сообщении, как тебе удобнее.",
  },
  {
    stage: "PRESENTATION",
    title: "Приглашение на презентацию",
    body: "{name}, приглашаю на короткую презентацию: [день, время, длительность]. Покажу, что это за дело, как оно работает и подойдёт ли оно именно тебе.\n\nСсылка: [ссылка]. Подтвердишь, что сможешь подключиться? Накануне напомню.",
  },
  {
    stage: "PRESENTATION",
    title: "После презентации: спросить впечатление",
    body: "{name}, спасибо, что нашёл(а) время! Что тебе понравилось больше всего? И какие вопросы остались?\n\nЧестно: если что-то показалось непонятным или неубедительным, это нормально, скажи, разберём.",
  },
  {
    stage: "DECIDING",
    title: "Помочь с решением",
    body: "{name}, как твои мысли после презентации? Тебе нужно время подумать, и это нормально, спешить не надо.\n\nЕсли хочешь, давай разберём сомнения вместе: что останавливает больше всего — деньги, время, доверие или что-то другое? Скажи честно, подскажу, как это решают другие.",
  },
  {
    stage: "DECIDING",
    title: "Возражение: «нет времени» или «дорого»",
    body: "{name}, понимаю тебя, это самые частые вопросы в начале.\n\nПо времени: многие начинают с 30–60 минут в день и подстраивают под свою жизнь. По деньгам: давай посчитаем вместе, что вложение даёт именно тебе, и ты решишь, оправдано ли оно. Хочешь, разберём на цифрах? Это ни к чему тебя не обязывает.",
  },
  {
    stage: "CLIENT",
    title: "Спасибо за первый заказ",
    body: "{name}, спасибо за доверие! Желаю, чтобы продукт принёс тебе пользу.\n\nЧерез [несколько дней] напишу, как твои впечатления. Если будут вопросы по применению или заказу, пиши мне в любое время: {my_name}.",
  },
  {
    stage: "CLIENT",
    title: "Отзыв и рекомендация",
    body: "{name}, как тебе продукт, какие результаты и впечатления? Мне очень важна твоя обратная связь.\n\nЕсли тебе понравилось, подскажи, пожалуйста, кому из знакомых это тоже могло бы быть полезно? Я ничего не навязываю: просто предложу им познакомиться, если они сами захотят.",
  },
  {
    stage: "PARTNER",
    title: "Добро пожаловать в команду",
    body: "{name}, поздравляю и добро пожаловать в команду! Рад(а), что мы будем работать вместе.\n\nПервые шаги:\n1) составь список из 50–100 знакомых, без оценок, просто имена;\n2) приходи на [стартовую встречу: дата, время];\n3) давай созвонимся [день, время] и составим твой план на первые 30 дней.\n\nЯ рядом и помогу на каждом шаге: {my_name}.",
  },
  {
    stage: "DECLINED",
    title: "Вежливое завершение разговора",
    body: "{name}, спасибо за честный ответ, я уважаю твоё решение. Было приятно пообщаться.\n\nЕсли когда-нибудь тема станет актуальной, пиши, буду рад(а) вернуться к разговору. Хорошего дня и всего доброго!",
  },
  {
    stage: "DECLINED",
    title: "Вернуться через несколько месяцев",
    body: "{name}, привет! Давно не общались, как у тебя дела?\n\nСо времени нашего разговора у нас много что изменилось: [что нового: продукты, условия, обучение]. Если тебе любопытно, расскажу коротко, а если нет, просто пожелаю хорошего дня.",
  },
  {
    stage: "NO_REPLY",
    title: "Мягкое напоминание",
    body: "{name}, привет! Не хочу быть навязчивым(ой): на случай, если моё сообщение затерялось. Тема всё ещё может быть интересна?\n\nЕсли нет, просто напиши «не сейчас», и я не буду беспокоить. Спасибо!",
  },
  {
    stage: null,
    title: "Напоминание накануне встречи",
    body: "{name}, напоминаю: завтра в [время] у нас [встреча или звонок]. Ссылка и детали: [ссылка].\n\nЕсли планы изменились, дай знать, перенесём без проблем.",
  },
  {
    stage: null,
    title: "Благодарность после разговора",
    body: "{name}, спасибо за разговор! Было интересно узнать, что для тебя важно.\n\nКак договорились, [что и когда сделаем дальше]. Если возникнут вопросы, пиши в любое время.",
  },
];

const EN: StarterScript[] = [
  {
    stage: "NEW",
    title: "First message to an acquaintance",
    body: "Hi {name}! It's {my_name}. We haven't talked in a while, how are you?\n\nI've started a new project and I'd really like your opinion: you understand people and business. If you're curious, I can tell you about it in 10 minutes. Would tonight or tomorrow work?",
  },
  {
    stage: "NEW",
    title: "First message: by recommendation",
    body: "Hello {name}! My name is {my_name}. [Who recommended] gave me your contact and said you might be interested in [topic: health, extra income, a new business].\n\nI can tell you in a few words what it is, and you decide whether it's for you. Is now a good time, or would another be better?",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Find out what matters to them",
    body: "{name}, thank you for replying! So I don't waste your time, one question: what matters most to you right now?\n\n1) extra income\n2) health and well-being\n3) a business of your own and growth\n4) just curious what this is\n\nWrite a number or your own words, and I'll tell you what could actually be useful to you.",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Set up a talk or a presentation",
    body: "{name}, let me show you, it's easier than explaining in messages. It takes 20-30 minutes.\n\nI can do [day and time] or [another day and time]. Which suits you? I'll send the link in advance.",
  },
  {
    stage: "WARMING",
    title: "Warming up: a useful material",
    body: "{name}, as promised, here is [link or material: a video, a story, a review]. It takes 5 minutes.\n\nHave a look when you have time and tell me what spoke to you and what raised questions. I'll ask tomorrow how it went.",
  },
  {
    stage: "WARMING",
    title: "Warming up: pick the talk up again",
    body: "Hi {name}! I remembered our talk. How are you, did you manage to look at the material?\n\nIf you have questions, we can go through them by phone or in a message, whichever you prefer.",
  },
  {
    stage: "PRESENTATION",
    title: "Invitation to a presentation",
    body: "{name}, I'd like to invite you to a short presentation: [day, time, length]. I'll show what this is, how it works and whether it fits you.\n\nLink: [link]. Can you confirm you'll join? I'll remind you the day before.",
  },
  {
    stage: "PRESENTATION",
    title: "After the presentation: ask for impressions",
    body: "{name}, thank you for finding the time! What did you like most? And what questions are left?\n\nHonestly, if something was unclear or unconvincing, that's fine, tell me and we'll go through it.",
  },
  {
    stage: "DECIDING",
    title: "Help with the decision",
    body: "{name}, what do you think after the presentation? You need time to think, and that's fine, there's no rush.\n\nIf you like, let's go through the doubts together: what holds you back most, money, time, trust or something else? Tell me honestly, and I'll share how others handle it.",
  },
  {
    stage: "DECIDING",
    title: "Objection: \"no time\" or \"too expensive\"",
    body: "{name}, I understand, these are the most common questions at the start.\n\nTime: many begin with 30-60 minutes a day and fit it into their life. Money: let's count together what it gives you in particular, and you decide if it's worth it. Shall we go through the numbers? It doesn't commit you to anything.",
  },
  {
    stage: "CLIENT",
    title: "Thanks for the first order",
    body: "{name}, thank you for your trust! I hope the product brings you real benefit.\n\nIn [a few days] I'll write to ask how it's going. If you have questions about use or ordering, write to me any time: {my_name}.",
  },
  {
    stage: "CLIENT",
    title: "Feedback and a recommendation",
    body: "{name}, how do you like the product, what results and impressions? Your feedback matters a lot to me.\n\nIf you liked it, could you tell me who among your friends might also find it useful? I won't push anyone: I'll only offer to get acquainted if they want to.",
  },
  {
    stage: "PARTNER",
    title: "Welcome to the team",
    body: "{name}, congratulations and welcome to the team! I'm glad we'll work together.\n\nFirst steps:\n1) write a list of 50-100 people you know, no judging, just names;\n2) come to [the start meeting: date, time];\n3) let's talk on [day, time] and make your plan for the first 30 days.\n\nI'm here to help at every step: {my_name}.",
  },
  {
    stage: "DECLINED",
    title: "A polite end of the talk",
    body: "{name}, thank you for your honest answer, I respect your decision. It was nice talking.\n\nIf the topic ever becomes relevant, write to me and I'll be glad to pick it up again. Have a great day!",
  },
  {
    stage: "DECLINED",
    title: "Come back after a few months",
    body: "Hi {name}! It's been a while, how are you?\n\nA lot has changed since our talk: [what's new: products, terms, training]. If you're curious, I'll tell you briefly, and if not, I'll simply wish you a good day.",
  },
  {
    stage: "NO_REPLY",
    title: "A gentle reminder",
    body: "Hi {name}! I don't want to be pushy: just in case my message got lost. Is the topic still of interest?\n\nIf not, simply write \"not now\" and I won't disturb you. Thank you!",
  },
  {
    stage: null,
    title: "Reminder the day before a meeting",
    body: "{name}, a reminder: tomorrow at [time] we have [a meeting or a call]. Link and details: [link].\n\nIf your plans changed, let me know and we'll move it with no problem.",
  },
  {
    stage: null,
    title: "Thanks after a talk",
    body: "{name}, thank you for the talk! It was interesting to learn what matters to you.\n\nAs agreed, [what we do next and when]. If any questions come up, write any time.",
  },
];

const PL: StarterScript[] = [
  {
    stage: "NEW",
    title: "Pierwsza wiadomość do znajomego",
    body: "Cześć {name}! Tu {my_name}. Dawno nie rozmawialiśmy, jak się masz?\n\nZaczynam nowy projekt i chętnie poznam Twoją opinię: znasz się na ludziach i biznesie. Jeśli Cię to ciekawi, opowiem w 10 minut. Pasuje dziś wieczorem czy jutro?",
  },
  {
    stage: "NEW",
    title: "Pierwsza wiadomość: z polecenia",
    body: "Dzień dobry {name}! Nazywam się {my_name}. [Kto polecił] dał mi Pani/Pana kontakt i powiedział, że temat [o czym: zdrowie, dodatkowy dochód, nowy biznes] może być interesujący.\n\nMogę w kilku słowach powiedzieć, co to jest, a Pani/Pan oceni, czy to dla niej/niego. Czy teraz to dobry moment, czy lepiej kiedy indziej?",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Dowiedzieć się, co jest ważne",
    body: "{name}, dziękuję za odpowiedź! Żeby nie tracić Twojego czasu, jedno pytanie: co jest dla Ciebie teraz najważniejsze?\n\n1) dodatkowy dochód\n2) zdrowie i samopoczucie\n3) własny biznes i rozwój\n4) po prostu ciekawi mnie, co to jest\n\nNapisz numer lub własnymi słowami, a opowiem to, co naprawdę może Ci się przydać.",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Umówić rozmowę lub prezentację",
    body: "{name}, pokażę Ci to na żywo, to łatwiejsze niż tłumaczenie w wiadomościach. Zajmie 20–30 minut.\n\nMogę [dzień i godzina] lub [inny dzień i godzina]. Który termin Ci pasuje? Link wyślę wcześniej.",
  },
  {
    stage: "WARMING",
    title: "Rozgrzewka: pomocny materiał",
    body: "{name}, jak obiecałem(am), przesyłam: [link lub materiał: film, historia, opinia]. To 5 minut.\n\nZerknij, gdy będziesz miał(a) czas, i napisz, co Cię zainteresowało, a co budzi pytania. Jutro zapytam, jak Ci się podobało.",
  },
  {
    stage: "WARMING",
    title: "Rozgrzewka: wrócić do rozmowy",
    body: "Cześć {name}! Przypomniała mi się nasza rozmowa. Jak się masz, udało się obejrzeć materiał?\n\nJeśli masz pytania, możemy je omówić przez telefon lub w wiadomości, jak wolisz.",
  },
  {
    stage: "PRESENTATION",
    title: "Zaproszenie na prezentację",
    body: "{name}, zapraszam na krótką prezentację: [dzień, godzina, czas trwania]. Pokażę, na czym to polega, jak działa i czy pasuje właśnie do Ciebie.\n\nLink: [link]. Potwierdzisz, że dołączysz? Dzień wcześniej przypomnę.",
  },
  {
    stage: "PRESENTATION",
    title: "Po prezentacji: zapytać o wrażenia",
    body: "{name}, dziękuję, że znalazłeś(aś) czas! Co podobało Ci się najbardziej? A jakie pytania zostały?\n\nSzczerze: jeśli coś było niejasne lub nieprzekonujące, to w porządku, powiedz, omówimy to.",
  },
  {
    stage: "DECIDING",
    title: "Pomoc w decyzji",
    body: "{name}, co myślisz po prezentacji? Potrzebujesz czasu na zastanowienie i to normalne, nie ma pośpiechu.\n\nJeśli chcesz, omówmy wątpliwości razem: co powstrzymuje najbardziej, pieniądze, czas, zaufanie czy coś innego? Powiedz szczerze, podpowiem, jak radzą sobie inni.",
  },
  {
    stage: "DECIDING",
    title: "Obiekcja: „brak czasu” lub „za drogo”",
    body: "{name}, rozumiem, to najczęstsze pytania na początku.\n\nCzas: wiele osób zaczyna od 30–60 minut dziennie i dopasowuje do swojego życia. Pieniądze: policzmy razem, co to daje właśnie Tobie, a Ty zdecydujesz, czy warto. Przejdziemy przez liczby? Do niczego Cię to nie zobowiązuje.",
  },
  {
    stage: "CLIENT",
    title: "Podziękowanie za pierwsze zamówienie",
    body: "{name}, dziękuję za zaufanie! Życzę, żeby produkt naprawdę Ci służył.\n\nZa [kilka dni] napiszę, jak wrażenia. Jeśli będziesz mieć pytania o stosowanie lub zamówienie, pisz o każdej porze: {my_name}.",
  },
  {
    stage: "CLIENT",
    title: "Opinia i polecenie",
    body: "{name}, jak Ci się podoba produkt, jakie efekty i wrażenia? Twoja opinia jest dla mnie bardzo ważna.\n\nJeśli Ci się spodobał, podpowiesz, komu ze znajomych mógłby się przydać? Nikogo nie namawiam: zaproponuję tylko poznanie tematu, jeśli sami zechcą.",
  },
  {
    stage: "PARTNER",
    title: "Witamy w zespole",
    body: "{name}, gratulacje i witamy w zespole! Cieszę się, że będziemy razem pracować.\n\nPierwsze kroki:\n1) spisz 50–100 znajomych, bez oceniania, same imiona;\n2) przyjdź na [spotkanie startowe: data, godzina];\n3) zadzwońmy [dzień, godzina] i ułóżmy Twój plan na pierwsze 30 dni.\n\nJestem obok i pomogę na każdym kroku: {my_name}.",
  },
  {
    stage: "DECLINED",
    title: "Uprzejme zakończenie rozmowy",
    body: "{name}, dziękuję za szczerą odpowiedź, szanuję Twoją decyzję. Miło się rozmawiało.\n\nJeśli temat kiedyś stanie się aktualny, napisz, chętnie wrócę do rozmowy. Miłego dnia!",
  },
  {
    stage: "DECLINED",
    title: "Wrócić po kilku miesiącach",
    body: "Cześć {name}! Dawno nie rozmawialiśmy, jak się masz?\n\nOd naszej rozmowy wiele się zmieniło: [co nowego: produkty, warunki, szkolenia]. Jeśli Cię to ciekawi, opowiem krótko, a jeśli nie, po prostu życzę miłego dnia.",
  },
  {
    stage: "NO_REPLY",
    title: "Delikatne przypomnienie",
    body: "Cześć {name}! Nie chcę być natrętny(a): na wypadek, gdyby moja wiadomość się zgubiła. Czy temat nadal może Cię interesować?\n\nJeśli nie, napisz po prostu „nie teraz”, a nie będę przeszkadzać. Dziękuję!",
  },
  {
    stage: null,
    title: "Przypomnienie dzień przed spotkaniem",
    body: "{name}, przypominam: jutro o [godzina] mamy [spotkanie lub rozmowę]. Link i szczegóły: [link].\n\nJeśli plany się zmieniły, daj znać, bez problemu przełożymy.",
  },
  {
    stage: null,
    title: "Podziękowanie po rozmowie",
    body: "{name}, dziękuję za rozmowę! Ciekawie było dowiedzieć się, co jest dla Ciebie ważne.\n\nJak ustaliliśmy, [co robimy dalej i kiedy]. Jeśli pojawią się pytania, pisz o każdej porze.",
  },
];

const UK: StarterScript[] = [
  {
    stage: "NEW",
    title: "Перше повідомлення знайомому",
    body: "Привіт, {name}! Це {my_name}. Давно не спілкувалися, як ти?\n\nУ мене з'явився новий проєкт, і мені хочеться почути твою думку: ти розбираєшся в людях і в справі. Якщо цікаво, розповім коротко, хвилин на 10. Коли тобі зручно: сьогодні ввечері чи завтра?",
  },
  {
    stage: "NEW",
    title: "Перше повідомлення: за рекомендацією",
    body: "Добрий день, {name}! Мене звати {my_name}. Ваш контакт мені передав [хто порекомендував], сказав, що вам може бути цікава тема [про що: здоров'я, додатковий дохід, нова справа].\n\nМожу двома словами розповісти, що це, а ви самі вирішите, ваше це чи ні. Зручно зараз, чи краще в інший час?",
  },
  {
    stage: "FIRST_CONTACT",
    title: "З'ясувати, що важливо людині",
    body: "{name}, дякую, що відгукнувся! Щоб не витрачати твій час дарма, одне запитання: що для тебе зараз найважливіше?\n\n1) додатковий дохід\n2) здоров'я та самопочуття\n3) своя справа і розвиток\n4) поки що просто цікаво, що це\n\nНапиши цифру або своїми словами. Виходячи з цього розповім саме те, що може бути корисне тобі.",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Призначити розмову або презентацію",
    body: "{name}, давай я покажу все наочно, це простіше, ніж пояснювати в листуванні. Займе 20–30 хвилин.\n\nМені зручно [день і час] або [інший день і час]. Який варіант тобі підходить? Надішлю посилання заздалегідь.",
  },
  {
    stage: "WARMING",
    title: "Прогрів: корисний матеріал",
    body: "{name}, як і обіцяв(ла), ділюся: [посилання або матеріал: відео, історія, відгук]. Це 5 хвилин.\n\nПодивись, коли буде час, і напиши, що відгукнулося, а що викликало запитання. Завтра запитаю, як тобі.",
  },
  {
    stage: "WARMING",
    title: "Прогрів: повернутися до розмови",
    body: "{name}, привіт! Згадав(ла) про нашу розмову. Як твої справи, вдалося переглянути матеріал?\n\nЯкщо залишилися запитання, давай розберемо їх по телефону або в повідомленні, як тобі зручніше.",
  },
  {
    stage: "PRESENTATION",
    title: "Запрошення на презентацію",
    body: "{name}, запрошую на коротку презентацію: [день, час, тривалість]. Покажу, що це за справа, як вона працює і чи підійде саме тобі.\n\nПосилання: [посилання]. Підтвердиш, що зможеш підключитися? Напередодні нагадаю.",
  },
  {
    stage: "PRESENTATION",
    title: "Після презентації: спитати враження",
    body: "{name}, дякую, що знайшов(ла) час! Що тобі сподобалося найбільше? І які запитання залишилися?\n\nЧесно: якщо щось здалося незрозумілим чи непереконливим, це нормально, скажи, розберемо.",
  },
  {
    stage: "DECIDING",
    title: "Допомогти з рішенням",
    body: "{name}, які в тебе думки після презентації? Тобі потрібен час подумати, і це нормально, поспішати не треба.\n\nЯкщо хочеш, давай розберемо сумніви разом: що зупиняє найбільше — гроші, час, довіра чи щось інше? Скажи чесно, підкажу, як це вирішують інші.",
  },
  {
    stage: "DECIDING",
    title: "Заперечення: «немає часу» або «дорого»",
    body: "{name}, розумію тебе, це найчастіші запитання на початку.\n\nЩодо часу: багато хто починає з 30–60 хвилин на день і підлаштовує під своє життя. Щодо грошей: давай порахуємо разом, що вкладення дає саме тобі, і ти вирішиш, чи воно виправдане. Хочеш, розберемо на цифрах? Це ні до чого тебе не зобов'язує.",
  },
  {
    stage: "CLIENT",
    title: "Дякую за перше замовлення",
    body: "{name}, дякую за довіру! Бажаю, щоб продукт приніс тобі користь.\n\nЧерез [кілька днів] напишу, які в тебе враження. Якщо будуть запитання щодо застосування чи замовлення, пиши мені будь-коли: {my_name}.",
  },
  {
    stage: "CLIENT",
    title: "Відгук і рекомендація",
    body: "{name}, як тобі продукт, які результати та враження? Мені дуже важливий твій зворотний зв'язок.\n\nЯкщо тобі сподобалося, підкажи, будь ласка, кому зі знайомих це теж могло б бути корисним? Я нічого не нав'язую: просто запропоную їм познайомитися, якщо вони самі захочуть.",
  },
  {
    stage: "PARTNER",
    title: "Ласкаво просимо до команди",
    body: "{name}, вітаю і ласкаво просимо до команди! Радий(а), що ми працюватимемо разом.\n\nПерші кроки:\n1) склади список із 50–100 знайомих, без оцінок, просто імена;\n2) приходь на [стартову зустріч: дата, час];\n3) давай зідзвонимося [день, час] і складемо твій план на перші 30 днів.\n\nЯ поруч і допоможу на кожному кроці: {my_name}.",
  },
  {
    stage: "DECLINED",
    title: "Ввічливе завершення розмови",
    body: "{name}, дякую за чесну відповідь, я поважаю твоє рішення. Було приємно поспілкуватися.\n\nЯкщо колись тема стане актуальною, пиши, буду радий(а) повернутися до розмови. Гарного дня і всього найкращого!",
  },
  {
    stage: "DECLINED",
    title: "Повернутися за кілька місяців",
    body: "{name}, привіт! Давно не спілкувалися, як у тебе справи?\n\nВід часу нашої розмови у нас багато що змінилося: [що нового: продукти, умови, навчання]. Якщо тобі цікаво, розповім коротко, а якщо ні, просто побажаю гарного дня.",
  },
  {
    stage: "NO_REPLY",
    title: "М'яке нагадування",
    body: "{name}, привіт! Не хочу бути нав'язливим(ою): на випадок, якщо моє повідомлення загубилося. Тема все ще може бути цікавою?\n\nЯкщо ні, просто напиши «не зараз», і я не турбуватиму. Дякую!",
  },
  {
    stage: null,
    title: "Нагадування напередодні зустрічі",
    body: "{name}, нагадую: завтра о [час] у нас [зустріч або дзвінок]. Посилання та деталі: [посилання].\n\nЯкщо плани змінилися, дай знати, перенесемо без проблем.",
  },
  {
    stage: null,
    title: "Подяка після розмови",
    body: "{name}, дякую за розмову! Було цікаво дізнатися, що для тебе важливо.\n\nЯк домовилися, [що і коли зробимо далі]. Якщо виникнуть запитання, пиши будь-коли.",
  },
];

export const STARTER_SCRIPTS: Record<StarterLocale, StarterScript[]> = { ru: RU, en: EN, pl: PL, uk: UK };

export const starterLocale = (l: string | null | undefined): StarterLocale => (l === "ru" || l === "pl" || l === "uk" ? l : "en");
