const f = (o) => ({ crm: o });
const fragment = {
  en: f({
    privacyTitle: "Who sees people's contacts", privacyHint: "A person's list of acquaintances is theirs. This decides what the people above them can see.",
    privacyPrivate: "Private (recommended)", privacyPrivateHint: "Everyone sees only their own people and what was shared with them, owners and admins included. The people above see numbers: touches, meetings, people by stage.",
    privacyOpen: "Open", privacyOpenHint: "Owners, admins and members with the whole CRM see everyone's contacts, as their CRM access level says.",
    privacyOwnerOnly: "Only the owner of the workspace can change this.", privacySaved: "Saved.", privacyFailed: "Could not save. Please try again.",
  }),
  ru: f({
    privacyTitle: "Кто видит контакты людей", privacyHint: "Список знакомых принадлежит тому, кто его ведёт. Здесь решается, что видят вышестоящие.",
    privacyPrivate: "Приватно (рекомендуется)", privacyPrivateHint: "Каждый видит только своих людей и то, чем с ним поделились, включая владельцев и админов. Вышестоящие видят числа: касания, встречи, людей по стадиям.",
    privacyOpen: "Открыто", privacyOpenHint: "Владельцы, админы и участники с полным доступом к CRM видят контакты всех, как задаёт их уровень доступа.",
    privacyOwnerOnly: "Менять это может только владелец пространства.", privacySaved: "Сохранено.", privacyFailed: "Не удалось сохранить. Попробуйте ещё раз.",
  }),
  pl: f({
    privacyTitle: "Kto widzi kontakty ludzi", privacyHint: "Lista znajomych należy do osoby, która ją prowadzi. Tu decydujesz, co widzą osoby wyżej.",
    privacyPrivate: "Prywatnie (zalecane)", privacyPrivateHint: "Każdy widzi tylko swoich ludzi i to, czym się z nim podzielono, także właściciele i administratorzy. Osoby wyżej widzą liczby: kontakty, spotkania, ludzi wg etapów.",
    privacyOpen: "Otwarte", privacyOpenHint: "Właściciele, administratorzy i uczestnicy z pełnym dostępem do CRM widzą kontakty wszystkich, zgodnie z poziomem dostępu.",
    privacyOwnerOnly: "Zmienić to może tylko właściciel przestrzeni.", privacySaved: "Zapisano.", privacyFailed: "Nie udało się zapisać. Spróbuj ponownie.",
  }),
  uk: f({
    privacyTitle: "Хто бачить контакти людей", privacyHint: "Список знайомих належить тому, хто його веде. Тут вирішується, що бачать вищі за ланкою.",
    privacyPrivate: "Приватно (рекомендовано)", privacyPrivateHint: "Кожен бачить лише своїх людей і те, чим з ним поділилися, зокрема власники й адміни. Вищі за ланкою бачать числа: дотики, зустрічі, людей за стадіями.",
    privacyOpen: "Відкрито", privacyOpenHint: "Власники, адміни та учасники з повним доступом до CRM бачать контакти всіх, як задає їхній рівень доступу.",
    privacyOwnerOnly: "Змінювати це може лише власник простору.", privacySaved: "Збережено.", privacyFailed: "Не вдалося зберегти. Спробуйте ще раз.",
  }),
};
export default fragment;
