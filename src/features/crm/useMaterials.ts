"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/features/mindmap/api";
import { qrMatrix } from "@/modules/qr";
import { qrBox, type MaterialKind, type MaterialLang, type QrPlace } from "@/modules/crm/materials";

export interface MaterialDto {
  id: string;
  title: string;
  kind: MaterialKind;
  lang: MaterialLang;
  category: string | null;
  url: string | null;
  hasFile: boolean;
  fileName: string | null;
  size: number | null;
  qr: QrPlace | null;
  shared: boolean;
  mine: boolean;
  /** What goes into a message. */
  link: string;
  canEdit: boolean;
}

export function useMaterials(workspaceId: string) {
  return useQuery({ queryKey: ["materials", workspaceId], staleTime: 30_000, queryFn: () => api.get<{ items: MaterialDto[]; canShare: boolean }>(`/api/v1/workspaces/${workspaceId}/materials`) });
}

/**
 * The picture for stories with the member's own QR code put in the place the leader chose, as a PNG to save.
 * The picture goes through our server so that the browser may draw on it.
 */
export async function storyWithQr(materialId: string, place: QrPlace, qrLink: string, fileName: string): Promise<void> {
  const res = await fetch(`/api/v1/materials/${materialId}/file`);
  if (!res.ok) throw new Error("file");
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("canvas");
  g.drawImage(bitmap, 0, 0);
  const box = qrBox(place, canvas.width, canvas.height);
  const m = qrMatrix(qrLink);
  const pad = Math.max(4, Math.round(box.side * 0.06));
  const cell = (box.side - pad * 2) / (m.length);
  g.fillStyle = "#ffffff";
  g.fillRect(box.x, box.y, box.side, box.side);
  g.fillStyle = "#000000";
  m.forEach((row, y) => row.forEach((dark, x) => dark && g.fillRect(Math.floor(box.x + pad + x * cell), Math.floor(box.y + pad + y * cell), Math.ceil(cell), Math.ceil(cell))));
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  if (!blob) throw new Error("png");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${fileName.replace(/\.[^.]+$/, "")}-qr.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
