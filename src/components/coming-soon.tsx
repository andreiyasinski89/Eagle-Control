import { getTranslations } from "next-intl/server";

export async function ComingSoon({ title }: { title: string }) {
  const t = await getTranslations("soon");
  return (
    <section className="max-w-xl p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted-foreground">
        {t("title")} — {t("body")}
      </p>
    </section>
  );
}
