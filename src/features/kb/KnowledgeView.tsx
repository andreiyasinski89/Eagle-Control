"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Info, Lightbulb, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { articleFor, articlesFor, CATEGORIES, langFor, searchArticles } from "@/modules/kb/articles";
import { resolveLink, type Block, type Inline } from "@/modules/kb/markdown";
import { cn } from "@/lib/utils";

/**
 * The knowledge base: articles on how things work, with search. Texts are written in a small Markdown subset and drawn by this page
 * (never as raw HTML); a link may go to a page of the app, to another article or to the web.
 */
export function KnowledgeView({ slug }: { slug: string }) {
  const t = useTranslations("kb");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const lang = langFor(locale);
  // The PDF guide and the slides exist in Russian and English only; Ukrainian readers get the English files for now.
  const fileLang = lang === "ru" ? "ru" : "en";
  const all = useMemo(() => articlesFor(lang), [lang]);
  const [q, setQ] = useState("");
  const selected = params.get("a");
  const article = selected ? articleFor(selected, lang) : null;
  const list = useMemo(() => searchArticles(all, q), [all, q]);

  const open = (a: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (a) next.set("a", a);
    else next.delete("a");
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: true });
  };

  const inline = (xs: Inline[]) =>
    xs.map((x, i) => {
      if (x.t === "text") return x.v;
      if (x.t === "bold") return <strong key={i}>{x.v}</strong>;
      const target = resolveLink(x.href);
      if (!target) return x.v;
      if (target.kind === "app") return <Link key={i} href={`/w/${slug}${target.path === "/" ? "" : target.path}`} className="text-primary underline-offset-2 hover:underline">{x.v}</Link>;
      if (target.kind === "kb") return <button key={i} type="button" onClick={() => open(target.slug)} className="text-primary underline-offset-2 hover:underline">{x.v}</button>;
      return <a key={i} href={target.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">{x.v}</a>;
    });

  const block = (b: Block, i: number) => {
    switch (b.type) {
      case "h2":
        return <h2 key={i} className="mt-6 text-xl font-semibold first:mt-0">{b.text}</h2>;
      case "h3":
        return <h3 key={i} className="mt-4 text-base font-semibold">{b.text}</h3>;
      case "p":
        return <p key={i} className="leading-relaxed">{inline(b.inline)}</p>;
      case "ul":
        return <ul key={i} className="ml-5 list-disc space-y-1 leading-relaxed">{b.items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ul>;
      case "ol":
        return <ol key={i} className="ml-5 list-decimal space-y-1 leading-relaxed">{b.items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ol>;
      case "tip":
        return (
          <aside key={i} className="flex gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p>{inline(b.inline)}</p>
          </aside>
        );
    }
  };

  const related = article
    ? [...new Set(article.blocks.flatMap((b) => (b.type === "p" || b.type === "tip" ? b.inline : b.type === "ul" || b.type === "ol" ? b.items.flat() : [])).flatMap((x) => (x.t === "link" && resolveLink(x.href)?.kind === "kb" ? [x.href.slice(3)] : [])))]
        .filter((s) => s !== article.slug)
        .map((s) => articleFor(s, lang))
        .filter((a): a is NonNullable<typeof a> => a !== null)
    : [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6" data-testid="kb-view">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="kb-downloads">
          <a href={`/guide/MeetOwl-guide-${fileLang}.pdf`} download className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm hover:border-primary hover:text-primary" data-testid="kb-download-pdf">
            <Download className="size-4" aria-hidden />
            {t("downloadPdf")}
          </a>
          <a href={`/guide/MeetOwl-presentation-${fileLang}.pptx`} download className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm hover:border-primary hover:text-primary" data-testid="kb-download-slides">
            <Download className="size-4" aria-hidden />
            {t("downloadSlides")}
          </a>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <aside className={cn("flex flex-col gap-3", article && "max-md:hidden")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <input aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="kb-search" className="h-9 w-full rounded-md border border-border bg-card pl-8 pr-2 text-sm" />
          </div>
          {list.length === 0 && <p className="px-1 text-sm text-muted-foreground">{t("noResults")}</p>}
          {q.trim() ? (
            <ul className="flex flex-col gap-1" data-testid="kb-results">
              {list.map((a) => row(a))}
            </ul>
          ) : (
            CATEGORIES.map((c) => {
              const items = list.filter((a) => a.category === c);
              return items.length === 0 ? null : (
                <nav key={c} aria-label={t(`category.${c}`)} className="flex flex-col gap-1">
                  <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`category.${c}`)}</h2>
                  <ul className="flex flex-col gap-0.5">{items.map((a) => row(a))}</ul>
                </nav>
              );
            })
          )}
        </aside>

        <article className={cn("min-w-0 rounded-2xl border border-border bg-card p-5 md:p-7", !article && "max-md:hidden")} data-testid="kb-article">
          {article ? (
            <div className="flex max-w-3xl flex-col gap-3">
              <button type="button" onClick={() => open(null)} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden">
                <ArrowLeft className="size-4" />
                {t("back")}
              </button>
              <h1 className="text-2xl font-semibold tracking-tight" data-testid="kb-title">{article.title}</h1>
              <p className="text-muted-foreground">{article.summary}</p>
              {lang === "en" && locale !== "en" && (
                <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <Info className="size-4 shrink-0" aria-hidden />
                  {t("untranslated")}
                </p>
              )}
              <div className="mt-2 flex flex-col gap-3">{article.blocks.map(block)}</div>
              {related.length > 0 && (
                <div className="mt-6 border-t border-border pt-4">
                  <h2 className="mb-2 text-sm font-semibold">{t("next")}</h2>
                  <ul className="flex flex-wrap gap-2">
                    {related.map((r) => (
                      <li key={r.slug}>
                        <button type="button" onClick={() => open(r.slug)} className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary hover:text-primary">
                          {r.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("pick")}</p>
          )}
        </article>
      </div>
    </div>
  );

  function row(a: { slug: string; title: string; summary: string }) {
    return (
      <li key={a.slug}>
        <button type="button" onClick={() => open(a.slug)} aria-current={selected === a.slug} data-testid="kb-row" data-article={a.slug} className={cn("flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left", selected === a.slug ? "bg-primary/10" : "hover:bg-muted")}>
          <span className="text-sm font-medium">{a.title}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{a.summary}</span>
        </button>
      </li>
    );
  }
}
