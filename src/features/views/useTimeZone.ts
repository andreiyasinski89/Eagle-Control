"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/features/mindmap/api";
import { isValidTimeZone } from "@/modules/views/tz";

interface Me {
  id: string;
  timezone: string;
}

/** The signed-in person's own time zone (Settings → Account); UTC until it is known or if it is not a real zone. */
export function useTimeZone() {
  const me = useQuery({ queryKey: ["me"], staleTime: 5 * 60_000, queryFn: () => api.get<Me>("/api/v1/me") });
  const saved = me.data?.timezone ?? null;
  return { tz: saved && isValidTimeZone(saved) ? saved : "UTC", saved, userId: me.data?.id ?? null, loaded: me.isSuccess || me.isError };
}
