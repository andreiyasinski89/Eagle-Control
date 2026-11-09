import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/features/legal/LegalPage";
import { env } from "@/lib/env";

/**
 * How to delete an MLM CRM account and its data, readable without signing in. Google Play asks every app that has accounts for such a
 * page (the "delete account URL" of the store listing); it also serves anyone who no longer has the app.
 */
export default async function DeleteAccount() {
  const t = await getTranslations("legal");
  const days = env().ACCOUNT_DELETION_GRACE_DAYS;
  const contact = env().LEGAL_CONTACT_EMAIL;
  return (
    <LegalPage title={t("deleteTitle")}>
      <p>{t("deleteIntro")}</p>
      <h2 className="font-semibold">{t("deleteHowTitle")}</h2>
      <ol className="list-decimal pl-5">
        <li>{t("deleteStep1")}</li>
        <li>{t("deleteStep2")}</li>
        <li>{t("deleteStep3", { days })}</li>
      </ol>
      <h2 className="font-semibold">{t("deleteWhatTitle")}</h2>
      <p>{t("deleteWhat")}</p>
      <p>{t("deleteKept")}</p>
      <h2 className="font-semibold">{t("deleteNoAccessTitle")}</h2>
      <p>{contact ? t("deleteNoAccess", { contact }) : t("deleteNoAccessNoContact")}</p>
    </LegalPage>
  );
}
