export type UiMode = "simple" | "advanced";
export const UI_MODES: readonly UiMode[] = ["simple", "advanced"];

/** The person's own choice; without one, simple for somebody who came through a platform invitation (an ambassador's newcomer) and advanced for everybody else. */
export function resolveUiMode(stored: string | null | undefined, referred: boolean): UiMode {
  if (stored === "simple" || stored === "advanced") return stored;
  return referred ? "simple" : "advanced";
}

type Messages = Record<string, unknown>;

/**
 * The simple mode is a layer over the same data: the words of the work tree are replaced (epic is a goal, sprint a week, task an action, subtask a step).
 * Only these lines are changed; everything else is the usual interface.
 */
export const SIMPLE_TERMS: Record<"en" | "ru" | "pl" | "uk", Messages> = {
  en: {
    map: { type: { EPIC: "Goal", SPRINT: "Week", TASK: "Action", SUBTASK: "Step" }, new: { EPIC: "New goal", SPRINT: "New week", TASK: "New action", SUBTASK: "New step" } },
    drawer: { tasksByStatus: "Actions by status ({count})", noTasks: "No actions yet." },
    nav: { myTasks: "My actions" },
    mytasks: { title: "My actions" },
    views: { itemKind: { task: "Action", milestone: "Goal / week" }, quickAdd: "Add an action", quickAddPlaceholder: "What to do", quickList: "Actions", createTasks: "Create actions", search: "Search actions" },
    myday: { statTasks: "Actions to do", planTasks: "Actions" },
  },
  ru: {
    map: { type: { EPIC: "Цель", SPRINT: "Неделя", TASK: "Действие", SUBTASK: "Шаг" }, new: { EPIC: "Новая цель", SPRINT: "Новая неделя", TASK: "Новое действие", SUBTASK: "Новый шаг" } },
    drawer: { tasksByStatus: "Действия по статусам ({count})", noTasks: "Действий пока нет." },
    nav: { myTasks: "Мои действия" },
    mytasks: { title: "Мои действия" },
    views: { itemKind: { task: "Действие", milestone: "Цель / неделя" }, quickAdd: "Добавить действие", quickAddPlaceholder: "Что сделать", quickList: "Действия", createTasks: "Создать действия", search: "Поиск действий" },
    myday: { statTasks: "Действий к выполнению", planTasks: "Действия" },
  },
  pl: {
    map: { type: { EPIC: "Cel", SPRINT: "Tydzień", TASK: "Działanie", SUBTASK: "Krok" }, new: { EPIC: "Nowy cel", SPRINT: "Nowy tydzień", TASK: "Nowe działanie", SUBTASK: "Nowy krok" } },
    drawer: { tasksByStatus: "Działania wg statusu ({count})", noTasks: "Brak działań." },
    nav: { myTasks: "Moje działania" },
    mytasks: { title: "Moje działania" },
    views: { itemKind: { task: "Działanie", milestone: "Cel / tydzień" }, quickAdd: "Dodaj działanie", quickAddPlaceholder: "Co zrobić", quickList: "Działania", createTasks: "Utwórz działania", search: "Szukaj działań" },
    myday: { statTasks: "Działań do zrobienia", planTasks: "Działania" },
  },
  uk: {
    map: { type: { EPIC: "Мета", SPRINT: "Тиждень", TASK: "Дія", SUBTASK: "Крок" }, new: { EPIC: "Нова мета", SPRINT: "Новий тиждень", TASK: "Нова дія", SUBTASK: "Новий крок" } },
    drawer: { tasksByStatus: "Дії за статусами ({count})", noTasks: "Дій поки немає." },
    nav: { myTasks: "Мої дії" },
    mytasks: { title: "Мої дії" },
    views: { itemKind: { task: "Дія", milestone: "Мета / тиждень" }, quickAdd: "Додати дію", quickAddPlaceholder: "Що зробити", quickList: "Дії", createTasks: "Створити дії", search: "Пошук дій" },
    myday: { statTasks: "Дій до виконання", planTasks: "Дії" },
  },
};

/** The messages with the lines of the overlay put over them (a copy: the original is shared between requests). */
export function overlayMessages(base: Messages, overlay: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    const cur = out[k];
    out[k] = v && typeof v === "object" && cur && typeof cur === "object" ? overlayMessages(cur as Messages, v as Messages) : v;
  }
  return out;
}
