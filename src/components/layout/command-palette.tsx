"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { CornerDownLeft, FolderKanban, Moon, Search, User, Building2, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { navGroups } from "@/components/layout/nav";
import type { ShellProps } from "@/components/layout/sidebar";
import { api } from "@/features/mindmap/api";
import { useRouter } from "@/i18n/navigation";

const OPEN_EVENT = "meetowl:palette";

/** ⌘K on a Mac, Ctrl K elsewhere. Decided after mount so the server and browser render the same first. */
function useShortcutLabel(): string {
  const [label, setLabel] = useState("Ctrl K");
  useEffect(() => {
    if (/mac|iphone|ipad/i.test(navigator.platform)) setLabel("⌘K");
  }, []);
  return label;
}

/** The search box in the top bar: looks like a field, opens the palette. */
export function SearchButton() {
  const t = useTranslations("shell");
  const shortcut = useShortcutLabel();
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="flex h-11 min-w-0 w-full max-w-sm items-center gap-2 md:h-9 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted"
      data-testid="search-button"
    >
      <Search className="size-4" />
      <span className="flex-1 truncate text-left">{t("search")}</span>
      <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium sm:inline">{shortcut}</kbd>
    </button>
  );
}

const itemClass = "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground";
const headingClass = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground";

/** Jump anywhere or run a quick action from the keyboard. Opens with ⌘K / Ctrl K or from the search box. */
export function CommandPalette({ workspaceId, ...shell }: ShellProps & { workspaceId: string }) {
  const t = useTranslations("shell");
  const tn = useTranslations("nav");
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const projects = useQuery({
    queryKey: ["palette-projects", workspaceId],
    enabled: open,
    staleTime: 30_000,
    queryFn: () => api.get<{ id: string; title: string }[]>(`/api/v1/workspaces/${workspaceId}/projects`),
  });

  if (!open) return null;
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const destinations = [...navGroups(shell.slug, shell.showCrm, tn).flatMap((g) => g.items), { href: `/w/${shell.slug}/settings/members`, label: tn("settings"), icon: User }];

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-3 pt-[12vh]" onClick={() => setOpen(false)} role="presentation" data-testid="command-palette">
      <Command
        label={t("search")}
        className={`w-[min(620px,100%)] overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl ${headingClass}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <Command.Input autoFocus placeholder={t("searchPlaceholder")} className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </div>
        <Command.List className="max-h-[min(420px,60vh)] overflow-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">{t("noResults")}</Command.Empty>
          <Command.Group heading={t("goTo")}>
            {destinations.map(({ href, label, icon: Icon }) => (
              <Command.Item key={href} value={`go ${label}`} onSelect={() => go(href)} className={itemClass}>
                <Icon className="size-4 text-muted-foreground" />
                <span className="flex-1">{label}</span>
                <ArrowRight className="size-3.5 opacity-50" />
              </Command.Item>
            ))}
          </Command.Group>
          {(projects.data?.length ?? 0) > 0 && (
            <Command.Group heading={t("projects")}>
              {projects.data!.map((p) => (
                <Command.Item key={p.id} value={`project ${p.title}`} onSelect={() => go(`/w/${shell.slug}/projects/p/${p.id}`)} className={itemClass}>
                  <FolderKanban className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{p.title}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {shell.workspaces.length > 1 && (
            <Command.Group heading={t("workspaces")}>
              {shell.workspaces
                .filter((w) => w.slug !== shell.slug)
                .map((w) => (
                  <Command.Item key={w.slug} value={`workspace ${w.name}`} onSelect={() => go(`/w/${w.slug}`)} className={itemClass}>
                    <Building2 className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{w.name}</span>
                  </Command.Item>
                ))}
            </Command.Group>
          )}
          <Command.Group heading={t("actions")}>
            <Command.Item
              value={`action ${t("toggleTheme")} dark light`}
              onSelect={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
                setOpen(false);
              }}
              className={itemClass}
            >
              <Moon className="size-4 text-muted-foreground" />
              {t("toggleTheme")}
            </Command.Item>
            <Command.Item value={`action ${t("account")}`} onSelect={() => go("/account")} className={itemClass}>
              <User className="size-4 text-muted-foreground" />
              {t("account")}
            </Command.Item>
          </Command.Group>
        </Command.List>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span>{t("paletteHint")}</span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="size-3" />
            {t("open")}
          </span>
        </div>
      </Command>
    </div>
  );
}
