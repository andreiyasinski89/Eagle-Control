"use client";

import { useEffect } from "react";
import { useReactFlow, ViewportPortal } from "@xyflow/react";
import { usePresenceStore } from "./presence-store";

/**
 * Other people's pointers, drawn in map coordinates so they stay on the same spot while anyone pans or zooms.
 * Also shares my own pointer (map coordinates) with them while it is over the canvas.
 */
export function CanvasPresence({ container }: { container: React.RefObject<HTMLElement | null> }) {
  const flow = useReactFlow();
  const others = usePresenceStore((s) => s.others);
  const setCursor = usePresenceStore((s) => s.setCursor);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const move = (e: PointerEvent) => setCursor(flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    const leave = () => setCursor(null);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      setCursor(null);
    };
  }, [container, flow, setCursor]);

  const visible = Object.values(others).filter((u) => u.cursor);
  return (
    <ViewportPortal>
      {visible.map((u) => (
        <div key={u.connId} data-testid="remote-cursor" className="pointer-events-none absolute z-50 transition-transform duration-100" style={{ transform: `translate(${u.cursor?.x ?? 0}px, ${u.cursor?.y ?? 0}px)` }}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M2 2 L2 14 L5.5 10.8 L8 16 L10.2 15 L7.8 9.9 L12.5 9.7 Z" fill={u.color} stroke="white" strokeWidth="1" />
          </svg>
          <span className="ml-3 -mt-1 inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium text-white" style={{ background: u.color }}>
            {u.name}
          </span>
        </div>
      ))}
    </ViewportPortal>
  );
}
