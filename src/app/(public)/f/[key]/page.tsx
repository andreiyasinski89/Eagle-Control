import { notFound } from "next/navigation";
import { PublicLeadForm } from "@/features/crm/PublicLeadForm";
import { isRefCode } from "@/modules/auth/signup";
import { ApiError } from "@/server/http/errors";
import { getPublicForm } from "@/server/services/crm/lead-ingest";

export const dynamic = "force-dynamic";

export default async function HostedForm({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ sent?: string; lang?: string; ref?: string }> }) {
  const [{ key }, { sent, lang, ref }] = await Promise.all([params, searchParams]);
  let form;
  try {
    form = await getPublicForm(key);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const c = form.config;
  // Owner, stage and workspace never leave the server.
  const config = { title: c.title, submitLabel: c.submitLabel, successMessage: c.successMessage, consentText: c.consentText, redirectUrl: c.redirectUrl, fields: c.fields };
  return <PublicLeadForm formKey={key} config={config} sent={sent === "1"} lang={lang === "ru" || lang === "pl" || lang === "uk" ? lang : "en"} refCode={isRefCode(ref) ? ref : null} />;
}
