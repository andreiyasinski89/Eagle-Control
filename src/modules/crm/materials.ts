export const MATERIAL_KINDS = ["PRESENTATION", "VIDEO", "IMAGE", "PDF", "OTHER"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
/** The languages of the team's materials; `uk` is Ukrainian (shown as UA). */
export const MATERIAL_LANGS = ["ru", "pl", "en", "de", "uk"] as const;
export type MaterialLang = (typeof MATERIAL_LANGS)[number];
export const LANG_LABEL: Record<MaterialLang, string> = { ru: "RU", pl: "PL", en: "EN", de: "DE", uk: "UA" };

export const QR_CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left", "center"] as const;
export type QrCorner = (typeof QR_CORNERS)[number];
/** Where the owner's own QR code is put on a picture for stories, and how wide it is (percent of the picture's width). */
export interface QrPlace {
  corner: QrCorner;
  size: number;
}
export const QR_SIZE_MIN = 10;
export const QR_SIZE_MAX = 40;

export function cleanQr(raw: unknown): QrPlace | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!(QR_CORNERS as readonly unknown[]).includes(o.corner)) return null;
  const size = typeof o.size === "number" && Number.isFinite(o.size) ? Math.round(o.size) : 24;
  return { corner: o.corner as QrCorner, size: Math.min(QR_SIZE_MAX, Math.max(QR_SIZE_MIN, size)) };
}

/** The top-left corner and the side of the QR square on a picture of the given size, with a margin of 4% of the width. */
export function qrBox(place: QrPlace, width: number, height: number): { x: number; y: number; side: number } {
  const side = Math.round((width * place.size) / 100);
  const gap = Math.round(width * 0.04);
  const left = place.corner.endsWith("left");
  const top = place.corner.startsWith("top");
  if (place.corner === "center") return { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), side };
  return { x: left ? gap : width - side - gap, y: top ? gap : height - side - gap, side };
}

const LINK = /^https?:\/\/[^\s]+$/i;
export const isLink = (v: string): boolean => LINK.test(v.trim());

/** A guess of the kind from a link or a file type, so the form can start with the right one. */
export function guessKind(urlOrMime: string): MaterialKind {
  const v = urlOrMime.toLowerCase();
  if (/youtu\.?be|vimeo|rutube|\.mp4|video\//.test(v)) return "VIDEO";
  if (v.startsWith("image/") || /\.(png|jpe?g|webp|gif)(\?|$)/.test(v)) return "IMAGE";
  if (v.includes("pdf")) return "PDF";
  if (/pptx?|presentation|canva|docs\.google\.com\/presentation|slides/.test(v)) return "PRESENTATION";
  return "OTHER";
}

/** The line put into a message for a material: its title and the link to give out. */
export function materialLine(title: string, link: string): string {
  return `${title}: ${link}`;
}
