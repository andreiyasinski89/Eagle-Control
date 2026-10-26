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
        <li>Only if switched on: payment (Stripe), calendar and chat integrations you connect, an AI provider (Anthropic) when you use AI features, a job scheduler (Inngest).</li>
      </ul>
      <p>Some of these providers are outside the European Economic Area; transfers rely on the providers&apos; standard contractual clauses or equivalent safeguards.</p>
      <h2 className="font-semibold">How long</h2>
      <p>While your account exists. When you delete it (Settings → Account) it is erased after a short grace period you can cancel; backups age out afterwards. A record that the deletion happened, without personal data, is kept.</p>
      <h2 className="font-semibold">Your rights</h2>
      <p>You can download your data and delete your account yourself in Settings → Account. You may also ask to correct or restrict processing, object to it, or complain to your data protection authority. Write to the contact above.</p>
    </LegalPage>
  );
}
