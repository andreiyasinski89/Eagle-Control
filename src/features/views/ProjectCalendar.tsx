"use client";

import { useState } from "react";
import { updateNode } from "@/features/mindmap/actions";
import { useMapStore } from "@/features/mindmap/store";
import { useSelection } from "@/features/mindmap/useSelection";
import { todayIn } from "@/modules/views/tz";
import { dayOf } from "@/modules/views/views";
import { CalendarGrid, type CalendarMode, type GridItem } from "./CalendarGrid";
import { useTimeZone } from "./useTimeZone";
import { useWorkItems } from "./useWorkItems";

/** Tasks on the day they fall due. Drag one to another day to move its deadline. */
export function ProjectCalendar() {
  const items = useWorkItems();
  const role = useMapStore((s) => s.role);
  const { select } = useSelection();
  const { tz } = useTimeZone();
  const [picked, setAnchor] = useState<string | null>(null);
  const anchor = picked ?? todayIn(tz);
  const [mode, setMode] = useState<CalendarMode>("month");

  const grid: GridItem[] = items
    .filter((i) => i.dueDate)
    .map((i) => ({
      id: i.id,
      title: i.title,
      day: dayOf(i.dueDate as string),
      tone: i.status === "DONE" || i.status === "CANCELLED" ? "done" : i.health === "RED" ? "red" : "default",
      onOpen: () => select(i.id),
    }));

  return <CalendarGrid timeZone={tz} anchor={anchor} mode={mode} onAnchor={setAnchor} onMode={setMode} items={grid} onMove={role === "CLIENT" ? undefined : (id, day) => void updateNode(id, { dueDate: `${day}T00:00:00.000Z` })} />;
}
