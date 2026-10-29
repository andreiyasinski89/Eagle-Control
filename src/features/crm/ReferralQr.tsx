"use client";

import { useEffect, useMemo, useRef } from "react";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { qrMatrix } from "@/modules/qr";

const SCALE = 10;
const QUIET = 4;
const CAPTION = 56;

/** Draws the code with the owner's name under it, so a printed or shared picture says whose link it is. */
function draw(canvas: HTMLCanvasElement, matrix: boolean[][], name: string, small: boolean) {
  const n = matrix.length;
  const side = (n + QUIET * 2) * SCALE;
  canvas.width = side;
  canvas.height = side + (name ? CAPTION : 0);
  const g = canvas.getContext("2d");
  if (!g) return;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#000000";
  matrix.forEach((row, y) => row.forEach((dark, x) => dark && g.fillRect((x + QUIET) * SCALE, (y + QUIET) * SCALE, SCALE, SCALE)));
  if (name) {
    g.fillStyle = "#111111";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `600 ${small ? 24 : 28}px system-ui, sans-serif`;
    g.fillText(name.length > 28 ? `${name.slice(0, 27)}…` : name, side / 2, side + CAPTION / 2 - 4, side - 24);
  }
}

/** The QR code of a link, as a picture to save (PNG). */
export function ReferralQr({ url, name, fileName }: { url: string; name: string; fileName: string }) {
  const t = useTranslations("referral");
  const ref = useRef<HTMLCanvasElement>(null);
  const matrix = useMemo(() => {
    try {
      return qrMatrix(url);
    } catch {
      return null;
    }
  }, [url]);
  useEffect(() => {
    if (ref.current && matrix) draw(ref.current, matrix, name, name.length > 18);
  }, [matrix, name]);

  if (!matrix) return <p className="text-xs text-danger">{t("qrTooLong")}</p>;
  const save = () => {
    ref.current?.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `${fileName}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };
  return (
    <div className="flex flex-col items-start gap-2" data-testid="referral-qr">
      <canvas ref={ref} role="img" aria-label={t("qrAlt")} className="h-auto w-48 max-w-full rounded-lg border border-border bg-white" />
      <Button type="button" variant="outline" className="min-h-11" onClick={save} data-testid="referral-qr-download">
        <Download className="size-4" />
        {t("qrDownload")}
      </Button>
    </div>
  );
}
