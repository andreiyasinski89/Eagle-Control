const en = {
  crm: {
    selectAll: "Select all", selectRow: "Select row", totalRows: "{count, plural, one {# record} other {# records}}", prevPage: "Previous page", nextPage: "Next page",
    importContacts: "Import contacts from CSV", importCompanies: "Import companies from CSV", importDone: "Import finished: {created} created, {updated} updated, {skipped} skipped.",
    importErrors: "{count, plural, one {# row could not be imported} other {# rows could not be imported}}", row: "Row {n}", csvFile: "CSV file", chooseFile: "Choose a file…",
    duplicates: "If a record already exists", duplicatesHint: "Matched by e-mail or phone (contacts), website, name or tax ID (companies).", policySkip: "Skip it", policyUpdate: "Update it", policyCreate: "Create a duplicate",
    encoding: "Encoding", encodingAuto: "Detect automatically", detected: "{rows} rows · separator “{delimiter}” · {encoding}", encodingGuessed: "Not UTF-8: check that the text looks right, or pick another encoding.",
    truncated: "Only the first 5,000 rows are imported.", mapColumns: "Match columns", willCreate: "{count} to create", willUpdate: "{count} to update", willSkip: "{count} to skip", willFail: "{count} with errors",
    verdict: "Result", preview: "Row", verdictOf: { create: "Create", update: "Update", skip: "Skip", error: "Error" }, runImport: "Import",
    field: { fullName: "Full name", firstName: "First name", lastName: "Last name", email: "E-mail", phone: "Phone", position: "Position", company: "Company", website: "Website", telegram: "Telegram", whatsapp: "WhatsApp", instagram: "Instagram", source: "Source", notes: "Notes", legalName: "Company name", industry: "Industry", size: "Size", country: "Country", city: "City", address: "Address", taxId: "Tax ID" },
    duplicateContacts: "Duplicate contacts", duplicateCompanies: "Duplicate companies", mergeExplain: "Merging keeps the record you pick, fills its gaps and unites e-mails and phones. Activities, deals, files and comments move over; the duplicates are then deleted. Consent is never inherited.",
    noDuplicates: "No duplicates found.", keepWhich: "Keep this record", merge: "Merge {count} records",
    lifecycle: { LEAD: "Lead", PROSPECT: "Prospect", CUSTOMER: "Customer", CHURNED: "Churned" }, lifecycleStage: "Stage", newCompany: "New company", similarExists: "A similar record already exists:", createAnyway: "Create anyway", createCompany: "Create company",
    openDeals: "Open deals", revenue: "Revenue", projectsHealth: "Projects", atRisk: "at risk", searchCompanies: "Search companies", allStages: "All stages", findDuplicates: "Find duplicates", exportCsv: "Export CSV", importCsv: "Import CSV",
    bulkActions: "Bulk actions", selected: "{count} selected", assignOwner: "Assign owner…", archive: "Archive", noCompanies: "No companies yet.",
    newContact: "New contact", createContact: "Create contact", consentGiven: "Consent to be contacted", name: "Name", messengers: "Messengers", lastTouch: "Last touch", consent: "Consent", searchContacts: "Search contacts", noTouch30: "No touch for 30 days", noContacts: "No contacts yet.",
    contactGone: "This contact no longer exists.", lastContact: "Last contact: {date}", neverContacted: "Never contacted", birthday: "Birthday", revoked: "revoked {date}", noDeals: "No deals.", privacy: "Privacy (GDPR)", exportPersonalData: "Export personal data",
    erase: "Erase permanently…", eraseTitle: "Erase {name}?", eraseBody: "This permanently deletes the person, their activities, comments, files and consent records. It cannot be undone. Deals stay, without this contact.", eraseConfirm: "Type ERASE to confirm", eraseForever: "Erase permanently",
    overview: "Overview", clientMap: "Client Map", companyGone: "This company no longer exists.", atRiskBanner: "One of this client's projects is in the red zone. Check it before the relationship suffers.", wonDeals: "from won deals", hoursWorked: "Hours worked", billableHours: "{hours} h billable",
    archiveBlocked: "Close or move its open deals first.", archiveConfirm: "Archive this company? Its contacts and deals stay.", status: "Status", statusOpen: "Open", statusOverdue: "Overdue", statusDone: "Done", statusAll: "All", allTypes: "All types",
  },
};

const ru = {
  crm: {
    selectAll: "Выбрать все", selectRow: "Выбрать строку", totalRows: "{count, plural, one {# запись} few {# записи} many {# записей} other {# записи}}", prevPage: "Предыдущая страница", nextPage: "Следующая страница",
    importContacts: "Импорт контактов из CSV", importCompanies: "Импорт компаний из CSV", importDone: "Импорт завершён: создано {created}, обновлено {updated}, пропущено {skipped}.",
    importErrors: "{count, plural, one {# строку не удалось импортировать} few {# строки не удалось импортировать} many {# строк не удалось импортировать} other {# строки не удалось импортировать}}", row: "Строка {n}", csvFile: "CSV-файл", chooseFile: "Выберите файл…",
    duplicates: "Если запись уже есть", duplicatesHint: "Совпадение по e-mail или телефону (контакты), сайту, названию или ИНН (компании).", policySkip: "Пропустить", policyUpdate: "Обновить", policyCreate: "Создать дубль",
    encoding: "Кодировка", encodingAuto: "Определить автоматически", detected: "{rows} строк · разделитель «{delimiter}» · {encoding}", encodingGuessed: "Не UTF-8: проверьте, что текст читается, или выберите другую кодировку.",
    truncated: "Импортируются только первые 5 000 строк.", mapColumns: "Сопоставление колонок", willCreate: "создать: {count}", willUpdate: "обновить: {count}", willSkip: "пропустить: {count}", willFail: "с ошибками: {count}",
    verdict: "Результат", preview: "Строка", verdictOf: { create: "Создать", update: "Обновить", skip: "Пропустить", error: "Ошибка" }, runImport: "Импортировать",
    field: { fullName: "Имя и фамилия", firstName: "Имя", lastName: "Фамилия", email: "E-mail", phone: "Телефон", position: "Должность", company: "Компания", website: "Сайт", telegram: "Telegram", whatsapp: "WhatsApp", instagram: "Instagram", source: "Источник", notes: "Заметки", legalName: "Название компании", industry: "Отрасль", size: "Размер", country: "Страна", city: "Город", address: "Адрес", taxId: "ИНН / налоговый номер" },
    duplicateContacts: "Дубли контактов", duplicateCompanies: "Дубли компаний", mergeExplain: "Слияние оставляет выбранную запись, заполняет её пустые поля и объединяет e-mail и телефоны. Активности, сделки, файлы и комментарии переносятся, дубли удаляются. Согласие никогда не наследуется.",
    noDuplicates: "Дублей не найдено.", keepWhich: "Оставить эту запись", merge: "Объединить записи: {count}",
    lifecycle: { LEAD: "Лид", PROSPECT: "Потенциальный", CUSTOMER: "Клиент", CHURNED: "Ушёл" }, lifecycleStage: "Стадия", newCompany: "Новая компания", similarExists: "Похожая запись уже есть:", createAnyway: "Всё равно создать", createCompany: "Создать компанию",
    openDeals: "Открытые сделки", revenue: "Выручка", projectsHealth: "Проекты", atRisk: "под угрозой", searchCompanies: "Поиск компаний", allStages: "Все стадии", findDuplicates: "Найти дубли", exportCsv: "Экспорт CSV", importCsv: "Импорт CSV",
    bulkActions: "Массовые действия", selected: "Выбрано: {count}", assignOwner: "Назначить ответственного…", archive: "В архив", noCompanies: "Компаний пока нет.",
    newContact: "Новый контакт", createContact: "Создать контакт", consentGiven: "Согласие на обработку данных", name: "Имя", messengers: "Мессенджеры", lastTouch: "Последнее касание", consent: "Согласие", searchContacts: "Поиск контактов", noTouch30: "Нет касаний 30 дней", noContacts: "Контактов пока нет.",
    contactGone: "Этого контакта больше нет.", lastContact: "Последний контакт: {date}", neverContacted: "Контактов не было", birthday: "День рождения", revoked: "отозвано {date}", noDeals: "Сделок нет.", privacy: "Приватность (GDPR)", exportPersonalData: "Экспорт персональных данных",
    erase: "Удалить навсегда…", eraseTitle: "Удалить {name}?", eraseBody: "Человек, его активности, комментарии, файлы и записи о согласии будут удалены безвозвратно. Сделки останутся без этого контакта.", eraseConfirm: "Введите ERASE для подтверждения", eraseForever: "Удалить навсегда",
    overview: "Обзор", clientMap: "Client Map", companyGone: "Этой компании больше нет.", atRiskBanner: "Один из проектов клиента в красной зоне. Проверьте его, пока не пострадали отношения.", wonDeals: "по выигранным сделкам", hoursWorked: "Отработано часов", billableHours: "{hours} ч оплачиваемых",
    archiveBlocked: "Сначала закройте или перенесите её открытые сделки.", archiveConfirm: "Архивировать компанию? Контакты и сделки останутся.", status: "Статус", statusOpen: "Открытые", statusOverdue: "Просроченные", statusDone: "Выполненные", statusAll: "Все", allTypes: "Все типы",
  },
};

const pl = {
  crm: {
    selectAll: "Zaznacz wszystko", selectRow: "Zaznacz wiersz", totalRows: "{count, plural, one {# rekord} few {# rekordy} many {# rekordów} other {# rekordu}}", prevPage: "Poprzednia strona", nextPage: "Następna strona",
    importContacts: "Import kontaktów z CSV", importCompanies: "Import firm z CSV", importDone: "Import zakończony: utworzono {created}, zaktualizowano {updated}, pominięto {skipped}.",
    importErrors: "{count, plural, one {Nie udało się zaimportować # wiersza} few {Nie udało się zaimportować # wierszy} many {Nie udało się zaimportować # wierszy} other {Nie udało się zaimportować # wiersza}}", row: "Wiersz {n}", csvFile: "Plik CSV", chooseFile: "Wybierz plik…",
    duplicates: "Jeśli rekord już istnieje", duplicatesHint: "Dopasowanie po e-mailu lub telefonie (kontakty), stronie, nazwie lub NIP (firmy).", policySkip: "Pomiń", policyUpdate: "Zaktualizuj", policyCreate: "Utwórz duplikat",
    encoding: "Kodowanie", encodingAuto: "Wykryj automatycznie", detected: "{rows} wierszy · separator „{delimiter}” · {encoding}", encodingGuessed: "To nie UTF-8: sprawdź, czy tekst wygląda poprawnie, lub wybierz inne kodowanie.",
    truncated: "Importowanych jest tylko pierwszych 5 000 wierszy.", mapColumns: "Dopasuj kolumny", willCreate: "do utworzenia: {count}", willUpdate: "do aktualizacji: {count}", willSkip: "do pominięcia: {count}", willFail: "z błędami: {count}",
    verdict: "Wynik", preview: "Wiersz", verdictOf: { create: "Utwórz", update: "Zaktualizuj", skip: "Pomiń", error: "Błąd" }, runImport: "Importuj",
    field: { fullName: "Imię i nazwisko", firstName: "Imię", lastName: "Nazwisko", email: "E-mail", phone: "Telefon", position: "Stanowisko", company: "Firma", website: "Strona", telegram: "Telegram", whatsapp: "WhatsApp", instagram: "Instagram", source: "Źródło", notes: "Notatki", legalName: "Nazwa firmy", industry: "Branża", size: "Wielkość", country: "Kraj", city: "Miasto", address: "Adres", taxId: "NIP" },
    duplicateContacts: "Duplikaty kontaktów", duplicateCompanies: "Duplikaty firm", mergeExplain: "Scalanie zachowuje wybrany rekord, uzupełnia jego luki i łączy e-maile oraz telefony. Aktywności, szanse, pliki i komentarze są przenoszone, a duplikaty usuwane. Zgoda nigdy nie jest dziedziczona.",
    noDuplicates: "Nie znaleziono duplikatów.", keepWhich: "Zachowaj ten rekord", merge: "Scal rekordy: {count}",
    lifecycle: { LEAD: "Lead", PROSPECT: "Potencjalny", CUSTOMER: "Klient", CHURNED: "Utracony" }, lifecycleStage: "Etap", newCompany: "Nowa firma", similarExists: "Podobny rekord już istnieje:", createAnyway: "Utwórz mimo to", createCompany: "Utwórz firmę",
    openDeals: "Otwarte szanse", revenue: "Przychód", projectsHealth: "Projekty", atRisk: "zagrożone", searchCompanies: "Szukaj firm", allStages: "Wszystkie etapy", findDuplicates: "Znajdź duplikaty", exportCsv: "Eksport CSV", importCsv: "Import CSV",
    bulkActions: "Akcje zbiorcze", selected: "Zaznaczono: {count}", assignOwner: "Przypisz opiekuna…", archive: "Archiwizuj", noCompanies: "Brak firm.",
    newContact: "Nowy kontakt", createContact: "Utwórz kontakt", consentGiven: "Zgoda na kontakt", name: "Imię", messengers: "Komunikatory", lastTouch: "Ostatni kontakt", consent: "Zgoda", searchContacts: "Szukaj kontaktów", noTouch30: "Brak kontaktu od 30 dni", noContacts: "Brak kontaktów.",
    contactGone: "Ten kontakt już nie istnieje.", lastContact: "Ostatni kontakt: {date}", neverContacted: "Brak kontaktu", birthday: "Urodziny", revoked: "cofnięta {date}", noDeals: "Brak szans.", privacy: "Prywatność (RODO)", exportPersonalData: "Eksportuj dane osobowe",
    erase: "Usuń trwale…", eraseTitle: "Usunąć {name}?", eraseBody: "Osoba, jej aktywności, komentarze, pliki i zapisy zgód zostaną trwale usunięte. Szanse pozostaną bez tego kontaktu.", eraseConfirm: "Wpisz ERASE, aby potwierdzić", eraseForever: "Usuń trwale",
    overview: "Przegląd", clientMap: "Client Map", companyGone: "Ta firma już nie istnieje.", atRiskBanner: "Jeden z projektów klienta jest w czerwonej strefie. Sprawdź go, zanim ucierpi relacja.", wonDeals: "z wygranych szans", hoursWorked: "Przepracowane godziny", billableHours: "{hours} h płatnych",
    archiveBlocked: "Najpierw zamknij lub przenieś jej otwarte szanse.", archiveConfirm: "Zarchiwizować firmę? Kontakty i szanse pozostaną.", status: "Status", statusOpen: "Otwarte", statusOverdue: "Zaległe", statusDone: "Zrobione", statusAll: "Wszystkie", allTypes: "Wszystkie typy",
  },
};

const fragment = { en, ru, pl };
export default fragment;
