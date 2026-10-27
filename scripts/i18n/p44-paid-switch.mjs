const fragment = {
  en: {
    billing: { betaPlan: "Open beta", betaOpen: "Paid plans are not open yet: everything is free and without limits for now." },
    admin: {
      paidPlans: "Paid plans",
      mode_off: "off",
      mode_preview: "preview",
      mode_on: "on",
      modeHint_off: "Everyone has everything for free; no trial, no limits, nothing can be bought.",
      modeHint_preview: "Only workspaces of the people in PAID_PLANS_PREVIEW_EMAILS live under the paid rules; everyone else has everything.",
      modeHint_on: "The paid rules apply to everyone: Free limits, Pro locks, the trial and payments.",
      recompute: "Recalculate plans",
      recomputed: "Plans recalculated: {n} of {total} workspaces changed.",
    },
  },
  ru: {
    billing: { betaPlan: "Открытая бета", betaOpen: "Платные тарифы пока не открыты: сейчас всё бесплатно и без лимитов." },
    admin: {
      paidPlans: "Платные тарифы",
      mode_off: "выключены",
      mode_preview: "предпросмотр",
      mode_on: "включены",
      modeHint_off: "У всех всё бесплатно: нет пробного периода, лимитов, и ничего нельзя купить.",
      modeHint_preview: "Платные правила действуют только в пространствах людей из PAID_PLANS_PREVIEW_EMAILS; у остальных всё открыто.",
      modeHint_on: "Платные правила действуют для всех: лимиты Free, замки Pro, пробный период и оплата.",
      recompute: "Пересчитать тарифы",
      recomputed: "Тарифы пересчитаны: изменилось пространств {n} из {total}.",
    },
  },
  pl: {
    billing: { betaPlan: "Otwarta beta", betaOpen: "Płatne plany nie są jeszcze otwarte: na razie wszystko jest za darmo i bez limitów." },
    admin: {
      paidPlans: "Płatne plany",
      mode_off: "wyłączone",
      mode_preview: "podgląd",
      mode_on: "włączone",
      modeHint_off: "Wszyscy mają wszystko za darmo: bez okresu próbnego, limitów, nic nie można kupić.",
      modeHint_preview: "Płatne zasady obowiązują tylko w przestrzeniach osób z PAID_PLANS_PREVIEW_EMAILS; reszta ma wszystko.",
      modeHint_on: "Płatne zasady obowiązują wszystkich: limity Free, blokady Pro, okres próbny i płatności.",
      recompute: "Przelicz plany",
      recomputed: "Plany przeliczone: zmieniło się {n} z {total} przestrzeni.",
    },
  },
};
export default fragment;
