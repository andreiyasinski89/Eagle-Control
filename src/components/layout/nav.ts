import { BarChart3, CalendarDays, Clock, FolderKanban, Handshake, LayoutDashboard } from "lucide-react";

/** Up to two letters for an avatar: the initials of a name, else the start of the address. */
export function initialsOf(name: string | null, email: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0] ?? email).slice(0, 2);
  return letters.toUpperCase();
}

/** The navigation shared by the desktop sidebar and the phone drawer. */
export function navGroups(slug: string, showCrm: boolean, t: (key: string) => string) {
  const base = `/w/${slug}`;
  return [
    {
      label: t("groupWork"),
      items: [
        { href: base, label: t("myDay"), icon: LayoutDashboard, exact: true },
        { href: `${base}/projects`, label: t("projects"), icon: FolderKanban },
        { href: `${base}/calendar`, label: t("calendar"), icon: CalendarDays },
        { href: `${base}/time`, label: t("time"), icon: Clock },
      ],
    },
    ...(showCrm
      ? [
          {
            label: t("groupCustomers"),
            items: [
              {
                href: `${base}/crm`,
                label: t("crm"),
                icon: Handshake,
                exact: false,
              },
            ],
          },
        ]
      : []),
    {
      label: t("groupInsights"),
      items: [
        {
          href: `${base}/reports`,
          label: t("reports"),
          icon: BarChart3,
          exact: false,
        },
      ],
    },
  ];
}

