import type { Stage } from "./people";
import type { Situation } from "./touch";

/**
 * Ready texts for the messages of a person who builds a team: one or two for every stage of the funnel and a few for any moment, written the way
 * people write to each other (informally, "ty", short). They are a start, not a rule: each is copied into a messenger with the name filled in
 * ({name}, {my_name}) and can be rewritten in the Scripts tab. Square brackets mark what to put in by hand. No promises about income, no pressure:
 * a person may always say no.
 *
 * A script made from these follows the language of the screen until somebody changes it; from then on its words stay as they were left
 * (see `starterKey` of a script). The sets are the same in every language, in the same order: the place in the set is the key.
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
    body: "Привет, {name}! Это {my_name} 🙂 Сто лет не общались, как ты вообще?\n\nУ меня тут новая тема, и мне реально важно твоё мнение: ты в людях и в делах разбираешься. Хочешь, расскажу в двух словах, минут на 10? Сегодня вечером или завтра, как тебе?",
  },
  {
    stage: "NEW",
    title: "Первое сообщение: по рекомендации",
    body: "Привет, {name}! Я {my_name}. Мне твой контакт дал [кто посоветовал], говорит, тебе может зайти тема [про что: здоровье, подработка, своё дело].\n\nМогу в двух словах рассказать, что это, а ты сам(а) решишь, твоё или нет. Сейчас удобно или лучше написать попозже?",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Узнать, что важно человеку",
    body: "{name}, спасибо за ответ! Чтобы не грузить тебя лишним, один вопрос: что тебе сейчас важнее всего?\n\n1) подработка или доп. доход\n2) здоровье и самочувствие\n3) своё дело и рост\n4) пока просто любопытно, что это\n\nНапиши цифру или своими словами, и я расскажу только то, что может быть тебе реально полезно.",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Позвать на разговор или презентацию",
    body: "{name}, давай я лучше покажу всё наглядно, так проще, чем в переписке. Минут 20–30.\n\nМне удобно [день и время] или [другой день и время]. Что тебе подходит? Скину ссылку заранее.",
  },
  {
    stage: "WARMING",
    title: "Прогрев: полезный материал",
    body: "{name}, как и обещал(а), кидаю: [ссылка или материал: видео, история, отзыв]. Всего 5 минут.\n\nПосмотри, когда будет время, и напиши, что зацепило, а что вызвало вопросы. Завтра спрошу, как тебе 🙂",
  },
  {
    stage: "WARMING",
    title: "Прогрев: вернуться к разговору",
    body: "{name}, привет! Вспомнил(а) про наш разговор. Как ты, получилось глянуть материал?\n\nЕсли остались вопросы, давай разберём: можно голосовым, звонком или тут, как удобнее.",
  },
  {
    stage: "PRESENTATION",
    title: "Приглашение на презентацию",
    body: "{name}, зову тебя на короткую презентацию: [день, время, сколько идёт]. Покажу, что это за тема, как всё устроено и подойдёт ли это именно тебе.\n\nСсылка: [ссылка]. Сможешь подключиться? Накануне напомню.",
  },
  {
    stage: "PRESENTATION",
    title: "После презентации: спросить впечатления",
    body: "{name}, спасибо, что выбрал(а) время! Что понравилось больше всего? И что осталось непонятным?\n\nЕсли что-то показалось странным или неубедительным, говори как есть, это нормально, разберёмся.",
  },
  {
    stage: "DECIDING",
    title: "Помочь определиться",
    body: "{name}, как у тебя мысли после презентации? Если нужно время подумать, без проблем, никто не торопит.\n\nЕсли хочешь, давай честно разберём сомнения: что больше всего тормозит, деньги, время, доверие или что-то ещё? Скажи как есть, расскажу, как с этим справляются другие.",
  },
  {
    stage: "DECIDING",
    title: "Возражение: «нет времени» или «дорого»",
    body: "{name}, понимаю, это самые частые вопросы вначале.\n\nПро время: многие стартуют с 30–60 минут в день и подстраивают под свою жизнь. Про деньги: давай вместе прикинем, что это даёт именно тебе, и ты сам(а) решишь, стоит ли оно того. Хочешь, посчитаем на цифрах? Ни к чему тебя это не обязывает.",
  },
  {
    stage: "CLIENT",
    title: "Спасибо за первый заказ",
    body: "{name}, спасибо за доверие! Надеюсь, продукт зайдёт и принесёт пользу.\n\nЧерез [пару дней] напишу, какие впечатления. А если появятся вопросы по применению или заказу, пиши в любой момент: {my_name}.",
  },
  {
    stage: "CLIENT",
    title: "Отзыв и рекомендация",
    body: "{name}, ну как тебе продукт, какие впечатления и результаты? Мне очень важна твоя обратная связь.\n\nЕсли понравилось, подскажи, кому из знакомых это тоже могло бы пригодиться? Я никому ничего не навязываю: просто предложу познакомиться с темой, если человеку самому интересно.",
  },
  {
    stage: "PARTNER",
    title: "Добро пожаловать в команду",
    body: "{name}, поздравляю и добро пожаловать в команду! Классно, что мы теперь вместе 🙌\n\nПервые шаги:\n1) набросай список из 50–100 знакомых, без оценок, просто имена;\n2) приходи на [стартовую встречу: дата, время];\n3) давай созвонимся [день, время] и составим твой план на первые 30 дней.\n\nЯ рядом и помогу на каждом шаге: {my_name}.",
  },
  {
    stage: "DECLINED",
    title: "Тёплое завершение разговора",
    body: "{name}, спасибо за честный ответ, уважаю твоё решение! Было приятно пообщаться.\n\nЕсли когда-нибудь тема станет актуальной, пиши, с радостью вернёмся к разговору. Хорошего тебе дня!",
  },
  {
    stage: "DECLINED",
    title: "Вернуться через пару месяцев",
    body: "{name}, привет! Сто лет не общались, как ты?\n\nС тех пор у нас многое поменялось: [что нового: продукты, условия, обучение]. Если любопытно, расскажу коротко, а если нет, просто пожелаю хорошего дня 🙂",
  },
  {
    stage: "NO_REPLY",
    title: "Мягкое напоминание",
    body: "{name}, привет! Не хочу надоедать: вдруг моё сообщение затерялось. Тема тебе всё ещё может быть интересна?\n\nЕсли нет, просто напиши «не сейчас», и я не буду беспокоить. Спасибо!",
  },
  {
    stage: null,
    title: "Напоминание накануне встречи",
    body: "{name}, напоминаю: завтра в [время] у нас [встреча или звонок]. Ссылка и детали: [ссылка].\n\nЕсли планы поменялись, дай знать, без проблем перенесём.",
  },
  {
    stage: null,
    title: "Спасибо за разговор",
    body: "{name}, спасибо за разговор! Было интересно узнать, что для тебя важно.\n\nКак договорились, [что и когда делаем дальше]. Если появятся вопросы, пиши в любое время.",
  },
];

const EN: StarterScript[] = [
  {
    stage: "NEW",
    title: "First message to an acquaintance",
    body: "Hey {name}! It's {my_name} 🙂 Feels like forever, how are you doing?\n\nI've got a new project going and I'd really love your take on it, you're good with people and business. Want the 2-minute version, or maybe 10 minutes on a call? Does tonight or tomorrow work?",
  },
  {
    stage: "NEW",
    title: "First message: by recommendation",
    body: "Hey {name}, I'm {my_name}. [Who recommended] gave me your contact and thought you might be into [topic: health, a side income, a business of your own].\n\nI can give you the quick version and you tell me if it's your thing or not. Is now okay, or should I ping you later?",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Find out what matters to them",
    body: "{name}, thanks for getting back to me! So I don't waste your time, one question: what matters most to you right now?\n\n1) extra income\n2) health and feeling good\n3) a business of your own and growth\n4) just curious what this is\n\nSend a number or just say it your way, and I'll tell you only what could actually be useful to you.",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Invite to a chat or a presentation",
    body: "{name}, let me just show you, it's way easier than explaining over text. About 20–30 minutes.\n\nI can do [day and time] or [another day and time]. What works for you? I'll send the link beforehand.",
  },
  {
    stage: "WARMING",
    title: "Warm-up: a useful material",
    body: "{name}, as promised, here's [link or material: video, story, review]. It's 5 minutes.\n\nHave a look when you get a minute and tell me what clicked and what raised questions. I'll check in tomorrow 🙂",
  },
  {
    stage: "WARMING",
    title: "Warm-up: pick the chat back up",
    body: "{name}, hey! Was thinking about our chat. How are you, did you get a chance to look at the material?\n\nIf you have questions, we can go through them: a voice message, a call or right here, whatever's easier.",
  },
  {
    stage: "PRESENTATION",
    title: "Invitation to a presentation",
    body: "{name}, I'd love you to join a short presentation: [day, time, how long]. I'll show what it is, how it works and whether it's right for you.\n\nLink: [link]. Can you make it? I'll remind you the day before.",
  },
  {
    stage: "PRESENTATION",
    title: "After the presentation: ask how it felt",
    body: "{name}, thanks for making time! What did you like most? And what's still unclear?\n\nIf anything felt odd or not convincing, just say so, totally fine, we'll sort it out.",
  },
  {
    stage: "DECIDING",
    title: "Help to decide",
    body: "{name}, what are your thoughts after the presentation? If you need time to think, no problem at all, no rush.\n\nIf you like, let's go through the doubts honestly: what holds you back most, money, time, trust or something else? Tell me straight and I'll share how others handle it.",
  },
  {
    stage: "DECIDING",
    title: "Objection: “no time” or “too expensive”",
    body: "{name}, I get it, those are the most common questions at the start.\n\nTime: lots of people start with 30–60 minutes a day and fit it around their life. Money: let's work out together what it gives you personally and you decide if it's worth it. Want to run the numbers? No strings attached.",
  },
  {
    stage: "CLIENT",
    title: "Thanks for the first order",
    body: "{name}, thank you for trusting me! I hope the product works well for you.\n\nIn [a few days] I'll check in on how it's going. And if you have any questions about using it or ordering, message me anytime: {my_name}.",
  },
  {
    stage: "CLIENT",
    title: "Feedback and a recommendation",
    body: "{name}, so how do you like the product, any results or impressions? Your feedback really matters to me.\n\nIf you liked it, who do you know that might find it useful too? I'm not pushing anything: I'd just offer them a look if they're curious.",
  },
  {
    stage: "PARTNER",
    title: "Welcome to the team",
    body: "{name}, congrats and welcome to the team! So glad we're doing this together 🙌\n\nFirst steps:\n1) jot down a list of 50–100 people you know, no judging, just names;\n2) come to [the kick-off meeting: date, time];\n3) let's hop on a call [day, time] and make your plan for the first 30 days.\n\nI've got your back every step of the way: {my_name}.",
  },
  {
    stage: "DECLINED",
    title: "A warm goodbye",
    body: "{name}, thanks for being honest, I respect your decision! It was nice talking.\n\nIf the topic ever becomes relevant, ping me and we'll pick it up. Have a great day!",
  },
  {
    stage: "DECLINED",
    title: "Come back in a couple of months",
    body: "{name}, hey! Long time no talk, how are you?\n\nA lot has changed on our side since we spoke: [what's new: products, terms, training]. If you're curious I'll give you the short version, and if not, I'll just wish you a great day 🙂",
  },
  {
    stage: "NO_REPLY",
    title: "A gentle reminder",
    body: "{name}, hey! Don't want to be a pest, just in case my message got buried. Might this still be interesting?\n\nIf not, just say \"not now\" and I'll leave you be. Thanks!",
  },
  {
    stage: null,
    title: "Reminder before a meeting",
    body: "{name}, quick reminder: tomorrow at [time] we have [a meeting or a call]. Link and details: [link].\n\nIf your plans changed, let me know and we'll move it, no problem.",
  },
  {
    stage: null,
    title: "Thanks for the chat",
    body: "{name}, thanks for the chat! It was great to learn what matters to you.\n\nAs agreed, [what we do next and when]. If any questions come up, message me anytime.",
  },
];

const PL: StarterScript[] = [
  {
    stage: "NEW",
    title: "Pierwsza wiadomość do znajomego",
    body: "Cześć, {name}! Tu {my_name} 🙂 Wieki się nie słyszeliśmy, jak tam u ciebie?\n\nMam nowy projekt i naprawdę zależy mi na twojej opinii, znasz się na ludziach i biznesie. Chcesz, to opowiem w skrócie, tak na 10 minut? Dziś wieczorem czy jutro?",
  },
  {
    stage: "NEW",
    title: "Pierwsza wiadomość: z polecenia",
    body: "Cześć, {name}! Tu {my_name}. [Kto polecił] dał mi twój kontakt i mówił, że może cię zainteresować temat [o czym: zdrowie, dodatkowy zarobek, własny biznes].\n\nMogę w kilku słowach powiedzieć, co to jest, a ty zdecydujesz, czy to coś dla ciebie. Pasuje ci teraz, czy lepiej napisać później?",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Dowiedzieć się, co jest ważne",
    body: "{name}, dzięki za odpowiedź! Żeby nie zawracać ci głowy bez sensu, jedno pytanie: co jest dla ciebie teraz najważniejsze?\n\n1) dodatkowy dochód\n2) zdrowie i samopoczucie\n3) własny biznes i rozwój\n4) na razie tylko ciekawi mnie, co to jest\n\nNapisz cyfrę albo własnymi słowami, a opowiem tylko to, co naprawdę może ci się przydać.",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Zaprosić na rozmowę lub prezentację",
    body: "{name}, pokażę ci to na żywo, tak łatwiej niż w wiadomościach. Zajmie 20–30 minut.\n\nPasuje mi [dzień i godzina] albo [inny dzień i godzina]. Co ci odpowiada? Link wyślę wcześniej.",
  },
  {
    stage: "WARMING",
    title: "Rozgrzewka: przydatny materiał",
    body: "{name}, jak obiecywałem(am), wrzucam: [link lub materiał: film, historia, opinia]. To 5 minut.\n\nObejrzyj, jak będziesz miał(a) chwilę, i napisz, co ci się spodobało, a co wzbudziło pytania. Jutro zapytam, jak wrażenia 🙂",
  },
  {
    stage: "WARMING",
    title: "Rozgrzewka: wrócić do rozmowy",
    body: "{name}, cześć! Przypomniała mi się nasza rozmowa. Jak się masz, udało ci się rzucić okiem na materiał?\n\nJeśli masz pytania, możemy je rozwiać: głosówką, telefonem albo tu, jak wolisz.",
  },
  {
    stage: "PRESENTATION",
    title: "Zaproszenie na prezentację",
    body: "{name}, zapraszam cię na krótką prezentację: [dzień, godzina, ile trwa]. Pokażę, co to jest, jak działa i czy to w ogóle coś dla ciebie.\n\nLink: [link]. Dasz radę się podłączyć? Dzień wcześniej ci przypomnę.",
  },
  {
    stage: "PRESENTATION",
    title: "Po prezentacji: zapytać o wrażenia",
    body: "{name}, dzięki, że znalazłeś(aś) czas! Co ci się podobało najbardziej? I co jest jeszcze niejasne?\n\nJeśli coś wydało się dziwne albo nieprzekonujące, mów jak jest, to normalne, wyjaśnimy.",
  },
  {
    stage: "DECIDING",
    title: "Pomóc się zdecydować",
    body: "{name}, jak twoje przemyślenia po prezentacji? Jeśli potrzebujesz czasu, spoko, nikt cię nie popędza.\n\nJak chcesz, przejdźmy szczerze przez wątpliwości: co hamuje cię najbardziej, pieniądze, czas, zaufanie czy coś innego? Powiedz wprost, opowiem, jak radzą sobie z tym inni.",
  },
  {
    stage: "DECIDING",
    title: "Obiekcja: „nie mam czasu” lub „drogo”",
    body: "{name}, rozumiem, to najczęstsze pytania na początku.\n\nCzas: wielu zaczyna od 30–60 minut dziennie i dopasowuje to do swojego życia. Pieniądze: policzmy razem, co to daje właśnie tobie, a ty zdecydujesz, czy warto. Chcesz przeliczyć na liczbach? Do niczego cię to nie zobowiązuje.",
  },
  {
    stage: "CLIENT",
    title: "Dzięki za pierwsze zamówienie",
    body: "{name}, dzięki za zaufanie! Mam nadzieję, że produkt ci się przyda.\n\nZa [kilka dni] odezwę się zapytać o wrażenia. A jak pojawią się pytania o stosowanie czy zamówienie, pisz w każdej chwili: {my_name}.",
  },
  {
    stage: "CLIENT",
    title: "Opinia i polecenie",
    body: "{name}, i jak ci produkt, jakie wrażenia i efekty? Twoja opinia jest dla mnie naprawdę ważna.\n\nJeśli ci się spodobał, podpowiedz, komu ze znajomych też mógłby się przydać? Niczego nie wciskam: po prostu zaproponuję zapoznanie się z tematem, jeśli ktoś sam będzie chciał.",
  },
  {
    stage: "PARTNER",
    title: "Witaj w zespole",
    body: "{name}, gratulacje i witaj w zespole! Super, że będziemy działać razem 🙌\n\nPierwsze kroki:\n1) spisz 50–100 znajomych, bez oceniania, same imiona;\n2) przyjdź na [spotkanie startowe: data, godzina];\n3) umówmy się na rozmowę [dzień, godzina] i ułożymy twój plan na pierwsze 30 dni.\n\nJestem obok i pomogę na każdym kroku: {my_name}.",
  },
  {
    stage: "DECLINED",
    title: "Ciepłe zakończenie rozmowy",
    body: "{name}, dzięki za szczerą odpowiedź, szanuję twoją decyzję! Miło się rozmawiało.\n\nJeśli kiedyś temat stanie się aktualny, pisz, chętnie wrócimy do rozmowy. Miłego dnia!",
  },
  {
    stage: "DECLINED",
    title: "Wrócić za kilka miesięcy",
    body: "{name}, cześć! Wieki się nie słyszeliśmy, jak tam u ciebie?\n\nOd naszej rozmowy sporo się u nas zmieniło: [co nowego: produkty, warunki, szkolenia]. Jeśli jesteś ciekaw(a), opowiem krótko, a jeśli nie, po prostu życzę miłego dnia 🙂",
  },
  {
    stage: "NO_REPLY",
    title: "Delikatne przypomnienie",
    body: "{name}, cześć! Nie chcę się narzucać, tylko na wypadek, gdyby moja wiadomość się zagubiła. Temat może cię jeszcze interesować?\n\nJeśli nie, napisz „nie teraz”, a nie będę przeszkadzać. Dzięki!",
  },
  {
    stage: null,
    title: "Przypomnienie przed spotkaniem",
    body: "{name}, przypominam: jutro o [godzina] mamy [spotkanie lub rozmowę]. Link i szczegóły: [link].\n\nJeśli plany się zmieniły, daj znać, bez problemu przełożymy.",
  },
  {
    stage: null,
    title: "Dzięki za rozmowę",
    body: "{name}, dzięki za rozmowę! Fajnie było dowiedzieć się, co jest dla ciebie ważne.\n\nJak ustaliliśmy, [co robimy dalej i kiedy]. Jak pojawią się pytania, pisz w każdej chwili.",
  },
];

const UK: StarterScript[] = [
  {
    stage: "NEW",
    title: "Перше повідомлення знайомому",
    body: "Привіт, {name}! Це {my_name} 🙂 Сто років не спілкувалися, як ти взагалі?\n\nУ мене тут нова тема, і мені справді важлива твоя думка: ти розбираєшся в людях і в справах. Хочеш, розповім у двох словах, хвилин на 10? Сьогодні ввечері чи завтра, як тобі?",
  },
  {
    stage: "NEW",
    title: "Перше повідомлення: за рекомендацією",
    body: "Привіт, {name}! Я {my_name}. Мені твій контакт дав [хто порадив], каже, тобі може зайти тема [про що: здоров'я, підробіток, своя справа].\n\nМожу в двох словах розповісти, що це, а ти сам(а) вирішиш, твоє чи ні. Зараз зручно чи краще написати пізніше?",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Дізнатися, що важливо людині",
    body: "{name}, дякую за відповідь! Щоб не гаяти твій час, одне питання: що для тебе зараз найважливіше?\n\n1) підробіток або додатковий дохід\n2) здоров'я і самопочуття\n3) своя справа і розвиток\n4) поки що просто цікаво, що це\n\nНапиши цифру або своїми словами, і я розповім лише те, що може бути тобі справді корисним.",
  },
  {
    stage: "FIRST_CONTACT",
    title: "Покликати на розмову чи презентацію",
    body: "{name}, давай я краще покажу все наочно, так простіше, ніж у листуванні. Хвилин 20–30.\n\nМені зручно [день і час] або [інший день і час]. Що тобі підходить? Скину посилання заздалегідь.",
  },
  {
    stage: "WARMING",
    title: "Прогрів: корисний матеріал",
    body: "{name}, як і обіцяв(ла), ділюся: [посилання або матеріал: відео, історія, відгук]. Усього 5 хвилин.\n\nПодивись, коли буде час, і напиши, що зачепило, а що викликало питання. Завтра спитаю, як тобі 🙂",
  },
  {
    stage: "WARMING",
    title: "Прогрів: повернутися до розмови",
    body: "{name}, привіт! Згадав(ла) про нашу розмову. Як ти, вдалося глянути матеріал?\n\nЯкщо лишилися питання, давай розберемо: можна голосовим, дзвінком або тут, як зручніше.",
  },
  {
    stage: "PRESENTATION",
    title: "Запрошення на презентацію",
    body: "{name}, кличу тебе на коротку презентацію: [день, час, скільки триває]. Покажу, що це за тема, як усе влаштовано і чи підійде це саме тобі.\n\nПосилання: [посилання]. Зможеш підключитися? Напередодні нагадаю.",
  },
  {
    stage: "PRESENTATION",
    title: "Після презентації: спитати враження",
    body: "{name}, дякую, що знайшов(ла) час! Що сподобалося найбільше? І що лишилося незрозумілим?\n\nЯкщо щось здалося дивним чи непереконливим, кажи як є, це нормально, розберемося.",
  },
  {
    stage: "DECIDING",
    title: "Допомогти визначитися",
    body: "{name}, як твої думки після презентації? Якщо потрібен час подумати, без проблем, ніхто не квапить.\n\nЯкщо хочеш, давай чесно розберемо сумніви: що найбільше гальмує, гроші, час, довіра чи щось інше? Скажи як є, розповім, як із цим справляються інші.",
  },
  {
    stage: "DECIDING",
    title: "Заперечення: «немає часу» або «дорого»",
    body: "{name}, розумію, це найпоширеніші питання на початку.\n\nПро час: багато хто починає з 30–60 хвилин на день і підлаштовує під своє життя. Про гроші: давай разом прикинемо, що це дає саме тобі, і ти сам(а) вирішиш, чи воно того варте. Хочеш, порахуємо на цифрах? Це ні до чого тебе не зобов'язує.",
  },
  {
    stage: "CLIENT",
    title: "Дякую за перше замовлення",
    body: "{name}, дякую за довіру! Сподіваюся, продукт зайде і принесе користь.\n\nЧерез [кілька днів] напишу, які враження. А якщо виникнуть питання щодо застосування чи замовлення, пиши будь-коли: {my_name}.",
  },
  {
    stage: "CLIENT",
    title: "Відгук і рекомендація",
    body: "{name}, ну як тобі продукт, які враження та результати? Мені дуже важливий твій відгук.\n\nЯкщо сподобалося, підкажи, кому зі знайомих це теж могло б стати в пригоді? Я нічого не нав'язую: просто запропоную познайомитися з темою, якщо людині самій цікаво.",
  },
  {
    stage: "PARTNER",
    title: "Ласкаво просимо до команди",
    body: "{name}, вітаю і ласкаво просимо до команди! Круто, що ми тепер разом 🙌\n\nПерші кроки:\n1) накидай список із 50–100 знайомих, без оцінок, просто імена;\n2) приходь на [стартову зустріч: дата, час];\n3) давай зателефонуємося [день, час] і складемо твій план на перші 30 днів.\n\nЯ поруч і допоможу на кожному кроці: {my_name}.",
  },
  {
    stage: "DECLINED",
    title: "Тепле завершення розмови",
    body: "{name}, дякую за чесну відповідь, поважаю твоє рішення! Було приємно поспілкуватися.\n\nЯкщо колись тема стане актуальною, пиши, із задоволенням повернемося до розмови. Гарного тобі дня!",
  },
  {
    stage: "DECLINED",
    title: "Повернутися за кілька місяців",
    body: "{name}, привіт! Сто років не спілкувалися, як ти?\n\nВід нашої розмови в нас багато що змінилося: [що нового: продукти, умови, навчання]. Якщо цікаво, розповім коротко, а якщо ні, просто побажаю гарного дня 🙂",
  },
  {
    stage: "NO_REPLY",
    title: "М'яке нагадування",
    body: "{name}, привіт! Не хочу набридати: раптом моє повідомлення загубилося. Тема тобі ще може бути цікава?\n\nЯкщо ні, просто напиши «не зараз», і я не турбуватиму. Дякую!",
  },
  {
    stage: null,
    title: "Нагадування напередодні зустрічі",
    body: "{name}, нагадую: завтра о [час] у нас [зустріч або дзвінок]. Посилання та деталі: [посилання].\n\nЯкщо плани змінилися, дай знати, без проблем перенесемо.",
  },
  {
    stage: null,
    title: "Дякую за розмову",
    body: "{name}, дякую за розмову! Було цікаво дізнатися, що для тебе важливо.\n\nЯк домовилися, [що і коли робимо далі]. Якщо виникнуть питання, пиши будь-коли.",
  },
];

export const STARTER_SCRIPTS: Record<StarterLocale, StarterScript[]> = { ru: RU, en: EN, pl: PL, uk: UK };

/**
 * The moment each ready-made script is for, by its place in the set (the sets are the same in every language, in the same order):
 * a first touch to a new name, a reminder after silence, words after a presentation, a return to someone who went quiet or said no.
 */
const SITUATION_OF: (Situation | null)[] = ["FIRST_TOUCH", "FIRST_TOUCH", null, null, null, "REMINDER", null, "AFTER_PRESENTATION", "AFTER_PRESENTATION", null, null, null, null, null, "RETURN", "REMINDER"];
export const starterSituation = (index: number): Situation | null => SITUATION_OF[index] ?? null;

export const starterLocale = (l: string | null | undefined): StarterLocale => (l === "ru" || l === "pl" || l === "uk" ? l : "en");

/** The key of a ready-made script: its place in the set, the same in every language. */
export const starterKeyOf = (index: number): string => `s${index}`;

/** The words of a ready-made script in a language, by its key; `null` for a key that is not one of ours. */
export function starterText(locale: string | null | undefined, key: string): StarterScript | null {
  const m = /^s(\d+)$/.exec(key);
  return m ? (STARTER_SCRIPTS[starterLocale(locale)][Number(m[1])] ?? null) : null;
}
