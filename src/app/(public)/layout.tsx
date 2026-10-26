import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = { title: "Contact form", robots: { index: false, follow: false } };

/** Separate root layout for pages embedded on other people's sites: no app chrome, no locale routing. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
