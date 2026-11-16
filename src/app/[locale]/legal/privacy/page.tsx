import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/features/legal/LegalPage";

export default async function Privacy() {
  const t = await getTranslations("legal");
  return (
    <LegalPage title={t("privacy")}>
      <h2 className="font-semibold">What we collect</h2>
      <ul className="list-disc pl-5">
        <li>Your e-mail address and name, to sign you in and show who did what.</li>
        <li>What you and your team put in the service: projects, tasks, comments, files, customers (CRM), time entries, settings.</li>
        <li>A session cookie that keeps you signed in. We use no advertising or tracking cookies.</li>
        <li>For abuse protection: salted hashes (not readable addresses) of the network address and e-mail used to request a sign-in link, kept for two days.</li>
        <li>When you agreed to these terms.</li>
      </ul>
      <h2 className="font-semibold">Why, and on what basis</h2>
      <p>To provide the service you asked for (contract), to keep it secure (legitimate interest) and to meet legal duties. Customer data you enter about other people is processed on your instructions: you are responsible for having a basis to store it.</p>
      <h2 className="font-semibold">Who else handles it</h2>
      <ul className="list-disc pl-5">
        <li>Hosting and database providers (for example Vercel and Neon) that run the service.</li>
        <li>An e-mail provider that delivers sign-in links and notifications.</li>
        <li>Only if switched on: a payment provider (PayPal), calendar and chat integrations you connect, an AI provider (Anthropic) when you use AI features, a job scheduler (Inngest).</li>
        <li>Voice notes: your browser&apos;s own speech service turns speech into text; we keep only the text, never the recording.</li>
      </ul>
      <p>Some of these providers are outside the European Economic Area; transfers rely on the providers&apos; standard contractual clauses or equivalent safeguards.</p>
      <h2 className="font-semibold" id="google">Google user data (Google Calendar)</h2>
      <p>Connecting Google Calendar is optional and is done by you in Settings → Integrations. MLM CRM then asks Google for one permission: to see, create, change and delete events in your calendars (<code>calendar.events</code>), together with your Google e-mail address to show which account is connected.</p>
      <ul className="list-disc pl-5">
        <li><b>What we do with it:</b> meetings and calls you plan in MLM CRM are created, changed and deleted as events in your primary Google Calendar; when you change or delete such an event in Google Calendar, the change comes back to MLM CRM. Events that were not created from MLM CRM are read only to find these changes and are never stored or imported.</li>
        <li><b>What we keep:</b> the access permission (a refresh token, stored encrypted), the connected e-mail address, and for each synced meeting the id of its Google event. Nothing else from your Google account is stored.</li>
        <li><b>Who sees it:</b> no one but you. Google user data is not sold, not shared with third parties, not used for advertising, and not used to train AI models. People at MLM CRM do not read it, except with your consent for support, for security or when the law requires it.</li>
        <li><b>Ending it:</b> Settings → Integrations → Disconnect removes the stored permission and also revokes it at Google. You can also remove access at myaccount.google.com/permissions. Deleting your account deletes all of it.</li>
      </ul>
      <p>MLM CRM&apos;s use and transfer to any other app of information received from Google APIs will adhere to the <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
      <h2 className="font-semibold">How long</h2>
      <p>While your account exists. When you delete it (Settings → Account) it is erased after a short grace period you can cancel; backups age out afterwards. A record that the deletion happened, without personal data, is kept.</p>
      <h2 className="font-semibold">Your rights</h2>
      <p>You can download your data and delete your account yourself in Settings → Account (how: mlmcrm.app/legal/delete-account). You may also ask to correct or restrict processing, object to it, or complain to your data protection authority. Write to the contact above.</p>
    </LegalPage>
  );
}
