"use client";

import { useEffect } from "react";

/** Puts the mode on the page itself, so that what sits outside the workspace frame (dialogs, drawers) is hidden the same way. */
export function UiModeAttr({ mode }: { mode: "simple" | "advanced" }) {
  useEffect(() => {
    document.documentElement.dataset.uiMode = mode;
    return () => {
      delete document.documentElement.dataset.uiMode;
    };
  }, [mode]);
  return null;
}
