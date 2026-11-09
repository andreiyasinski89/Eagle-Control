"use client";

import { useEffect, useState } from "react";
import { ANDROID_COOKIE, ANDROID_KEY, cameFromAndroidApp } from "@/modules/app/android";

const read = (): boolean => {
  try {
    return localStorage.getItem(ANDROID_KEY) === "1";
  } catch {
    return false;
  }
};

/** Remembers once that the platform runs inside the Android app (see modules/app/android.ts); the mark stays for this device. */
export function AndroidAppMarker() {
  useEffect(() => {
    if (!cameFromAndroidApp(window.location.search, document.referrer)) return;
    try {
      localStorage.setItem(ANDROID_KEY, "1");
    } catch {
      /* private mode: the cookie below still does it */
    }
    document.cookie = `${ANDROID_COOKIE}=android; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return null;
}

/** True inside the Android app from Google Play (after the first render, to match the server). */
export function useAndroidApp(): boolean {
  const [android, setAndroid] = useState(false);
  useEffect(() => setAndroid(read() || document.cookie.split("; ").some((c) => c === `${ANDROID_COOKIE}=android`)), []);
  return android;
}
