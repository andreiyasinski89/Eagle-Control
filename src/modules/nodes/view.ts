import type { NodeStatus } from "@prisma/client";

/** Below this zoom the text on a card is too small to read; the first view of a map should not be smaller than this. */
export const READABLE_ZOOM = 0.55;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Where the map should be when it opens. A map that fits the screen at a readable zoom is centred, as before. One that
 * would need a smaller zoom opens at the readable zoom with the root at the left edge and centred vertically, so you
 * see real cards starting from the top of the tree instead of an overview of dots (the fit button still gives the overview).
 */
export function initialViewport(bounds: Box, size: { width: number; height: number }, root: Box, opts: { padding?: number; maxZoom?: number } = {}): Viewport {
  const { padding = 0.2, maxZoom = 1 } = opts;
  const fit = Math.min(size.width / (bounds.width * (1 + padding)), size.height / (bounds.height * (1 + padding)), maxZoom);
  if (fit >= READABLE_ZOOM) {
    return { zoom: fit, x: size.width / 2 - (bounds.x + bounds.width / 2) * fit, y: size.height / 2 - (bounds.y + bounds.height / 2) * fit };
  }
  const zoom = READABLE_ZOOM;
  return { zoom, x: 48 - root.x * zoom, y: size.height / 2 - (root.y + root.height / 2) * zoom };
}

export type StatusTone = "neutral" | "active" | "review" | "done" | "muted";

/** How a status is coloured on a card: grey while waiting, accent while worked on, amber in review, green when done. */
export const STATUS_TONE: Record<NodeStatus, StatusTone> = {
  BACKLOG: "neutral",
  TODO: "neutral",
  IN_PROGRESS: "active",
  IN_REVIEW: "review",
  DONE: "done",
  CANCELLED: "muted",
};

/** Only work items carry a visible status; epics, sprints, documents and events show their health and progress instead. */
export const showsStatus = (type: string): boolean => type === "TASK" || type === "SUBTASK";
