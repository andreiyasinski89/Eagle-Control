"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Series colours: distinct in hue and in lightness, so they survive colour-blindness and both themes. */
export const SERIES = ["#6366f1", "#0891b2", "#d97706", "#9333ea", "#16a34a", "#dc2626"] as const;

const H = 220;
const PAD = { l: 34, r: 10, t: 10, b: 26 };
const innerH = H - PAD.t - PAD.b;
const FONT = 11;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** The chart is drawn at its real pixel width, so text stays the same size in a narrow card as in a wide one. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

interface Geo {
  w: number;
  innerW: number;
  max: number;
}
const geo = (w: number, max: number): Geo => ({ w, innerW: w - PAD.l - PAD.r, max });
const xAt = (g: Geo, i: number, n: number) => PAD.l + (n <= 1 ? g.innerW / 2 : (g.innerW * i) / (n - 1));
const yAt = (g: Geo, v: number) => PAD.t + innerH * (1 - v / g.max);

function Frame({ g, children, label, summary }: { g: Geo; children: React.ReactNode; label: string; summary: string }) {
  const id = useId();
  const ticks = [0, 0.5, 1].map((f) => ({ y: PAD.t + innerH * (1 - f), v: Math.round(g.max * f * 10) / 10 }));
  return (
    <svg width={g.w} height={H} viewBox={`0 0 ${g.w} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="block text-muted-foreground">
      <title id={`${id}-t`}>{label}</title>
      <desc id={`${id}-d`}>{summary}</desc>
      {ticks.map((t) => (
        <g key={t.y}>
          <line x1={PAD.l} x2={g.w - PAD.r} y1={t.y} y2={t.y} stroke="currentColor" strokeOpacity={0.2} />
          <text x={PAD.l - 6} y={t.y + 4} textAnchor="end" fontSize={FONT} fill="currentColor">
            {t.v}
          </text>
        </g>
      ))}
      {children}
    </svg>
  );
}

function XLabels({ g, labels }: { g: Geo; labels: string[] }) {
  const step = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(g.innerW / 56))));
  return (
    <>
      {labels.map((l, i) =>
        i % step === 0 ? (
          <text key={i} x={xAt(g, i, labels.length)} y={H - 8} textAnchor="middle" fontSize={FONT} fill="currentColor">
            {l}
          </text>
        ) : null,
      )}
    </>
  );
}

export interface LineSeries {
  name: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

export function LineChart({ labels, series, label }: { labels: string[]; series: LineSeries[]; label: string }) {
  const [ref, w] = useWidth();
  const g = geo(w, niceMax(Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)))));
  const path = (s: LineSeries) => {
    let d = "";
    s.values.forEach((v, i) => {
      if (v === null) return;
      d += `${d && s.values[i - 1] !== null ? "L" : "M"}${xAt(g, i, labels.length)} ${yAt(g, v)} `;
    });
    return d;
  };
  return (
    <div ref={ref}>
      <Frame g={g} label={label} summary={series.map((s) => `${s.name}: ${s.values.filter((v) => v !== null).slice(-1)[0] ?? 0}`).join("; ")}>
        {series.map((s) => (
          <path key={s.name} d={path(s)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} />
        ))}
        <XLabels g={g} labels={labels} />
      </Frame>
      <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />
    </div>
  );
}

export function StackedArea({ labels, series, label }: { labels: string[]; series: { name: string; color: string; values: number[] }[]; label: string }) {
  const [ref, w] = useWidth();
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const g = geo(w, niceMax(Math.max(0, ...totals)));
  const paths = series.map((s, k) => {
    const below = (i: number) => series.slice(0, k).reduce((a, x) => a + (x.values[i] ?? 0), 0);
    const top = labels.map((_, i) => `${xAt(g, i, labels.length)} ${yAt(g, below(i) + (s.values[i] ?? 0))}`);
    const bottom = labels.map((_, i) => `${xAt(g, i, labels.length)} ${yAt(g, below(i))}`).reverse();
    return { name: s.name, color: s.color, d: `M${top.join(" L")} L${bottom.join(" L")} Z` };
  });
  return (
    <div ref={ref}>
      <Frame g={g} label={label} summary={series.map((s) => `${s.name}: ${s.values[s.values.length - 1] ?? 0}`).join("; ")}>
        {paths.map((p) => (
          <path key={p.name} d={p.d} fill={p.color} fillOpacity={0.85} stroke="var(--card)" strokeWidth={1} />
        ))}
        <XLabels g={g} labels={labels} />
      </Frame>
      <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />
    </div>
  );
}

export function GroupedBars({ labels, series, label }: { labels: string[]; series: { name: string; color: string; values: number[] }[]; label: string }) {
  const [ref, w] = useWidth();
  const g = geo(w, niceMax(Math.max(0, ...series.flatMap((s) => s.values))));
  const group = g.innerW / Math.max(labels.length, 1);
  const bar = Math.min(28, (group * 0.8) / series.length);
  const maxChars = Math.max(3, Math.floor(group / 7));
  const step = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(g.innerW / 56))));
  return (
    <div ref={ref}>
      <Frame g={g} label={label} summary={labels.map((l, i) => `${l}: ${series.map((s) => s.values[i] ?? 0).join("/")}`).join("; ")}>
        {labels.map((l, i) => (
          <g key={l + i}>
            {series.map((s, k) => {
              const v = s.values[i] ?? 0;
              const x = PAD.l + group * i + (group - bar * series.length) / 2 + bar * k;
              return <rect key={s.name} x={x} y={yAt(g, v)} width={Math.max(1, bar - 2)} height={Math.max(0, PAD.t + innerH - yAt(g, v))} fill={s.color} rx={2} />;
            })}
            {i % step === 0 && (
              <text x={PAD.l + group * i + group / 2} y={H - 8} textAnchor="middle" fontSize={FONT} fill="currentColor">
                {l.length > maxChars ? `${l.slice(0, Math.max(1, maxChars - 1))}…` : l}
              </text>
            )}
          </g>
        ))}
      </Frame>
      <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />
    </div>
  );
}

/** Horizontal bars with the number at the end of each, for funnels and histograms. */
export function HBars({ rows, color = SERIES[0], format = (n: number) => String(n) }: { rows: { label: string; value: number; note?: string }[]; color?: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3" role="list">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          {/* The name is written out in full (it wraps), with the number at the end of its line and the bar under it. */}
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words text-foreground/80">{r.label}</span>
            <span className="shrink-0 tabular-nums">
              {format(r.value)}
              {r.note && <span className="ml-1 text-xs text-muted-foreground">{r.note}</span>}
            </span>
          </div>
          <span className="mt-1 block h-2 rounded bg-muted">
            <span className="block h-full rounded" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.name}
        </li>
      ))}
    </ul>
  );
}
