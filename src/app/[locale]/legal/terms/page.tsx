import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/features/legal/LegalPage";

export default async function Terms() {
  const t = await getTranslations("legal");
  return (
    <LegalPage title={t("terms")}>
      <h2 className="font-semibold">The service</h2>
      <p>MeetOwl lets teams plan work on mind maps and manage customers. It is early software offered as is, without a promise of uninterrupted availability. Features may change.</p>
      <h2 className="font-semibold">Your account</h2>
      <p>Use a real e-mail address you control and keep access to it: the sign-in link is the key to the account. You are responsible for what happens under it and for the people you invite.</p>
      <h2 className="font-semibold">Your content</h2>
      <p>What you put in stays yours. You give us the right to store and process it only to run the service for you. Do not upload anything unlawful, do not store people&apos;s data without a legal basis, and do not store special categories of data (health, beliefs and the like) unless you have one.</p>
      <h2 className="font-semibold">Acceptable use</h2>
      <p>No attacks on the service or other users, no scraping or load testing without permission, no sending spam, no attempts to access data that is not yours.</p>
      <h2 className="font-semibold">Plans and payment</h2>
      <p>Free and Pro plans are described in the app. Paid plans are billed by Stripe and can be cancelled at any time; the plan runs to the end of the period paid for.</p>
      <h2 className="font-semibold">Ending</h2>
      <p>You can delete your account at any time (Settings → Account). We may suspend accounts that break these terms or endanger the service.</p>
      <h2 className="font-semibold">Liability</h2>
      <p>To the extent the law allows, the service is provided without warranty and our liability is limited to the amount you paid in the previous twelve months. Nothing here limits liability that cannot be limited by law.</p>
      <h2 className="font-semibold">Changes and law</h2>
      <p>We will tell you about material changes to these terms in the app or by e-mail. The law of the operator&apos;s country applies, without affecting your consumer rights where you live.</p>
    </LegalPage>
  );
}
