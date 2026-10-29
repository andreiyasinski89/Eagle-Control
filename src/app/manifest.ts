import type { MetadataRoute } from "next";

/** What a phone shows when MeetOwl is added to the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MeetOwl",
    short_name: "MeetOwl",
    description: "Agile mind map and CRM",
    id: "/",
    start_url: "/",
    scope: "/",
    orientation: "portrait",
    categories: ["business", "productivity"],
    shortcuts: [
      { name: "My day", short_name: "Day", url: "/" },
      { name: "Touches", short_name: "Touches", url: "/" },
    ],
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#7c3aed",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
