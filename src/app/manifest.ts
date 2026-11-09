import type { MetadataRoute } from "next";

/** What a phone shows when the platform is added to the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MLM CRM",
    short_name: "MLM CRM",
    description: "CRM for network marketing: your people, daily touches, meetings and team in one place.",
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
    id: "/",
    start_url: "/",
    scope: "/",
    orientation: "portrait",
    categories: ["business", "productivity"],
    // Long-press on the app icon: straight to the place of the day. "/?to=…" opens it in the person's own workspace.
    shortcuts: [
      { name: "My day", short_name: "Day", url: "/?to=day", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Touches", short_name: "Touches", url: "/?to=touches", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "People", short_name: "People", url: "/?to=people", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Calendar", short_name: "Calendar", url: "/?to=calendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#7c3aed",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // For phones that cut their own shape out of the icon (a circle, a rounded square): a full square with the mark well inside it.
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
