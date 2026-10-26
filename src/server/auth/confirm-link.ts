/**
 * The link in the e-mail opens a page with a button, and only the button (a form POST) uses up the one-time link. Mail
 * scanners and link previewers fetch every link in a message; if that fetch signed in, the link would be gone before the
 * person clicked. A link that points at localhost in production means AUTH_URL is not set: refuse instead of mailing dead links.
 */
export function confirmLink(callbackUrl: string): string {
  const u = new URL(callbackUrl);
  if (process.env.NODE_ENV === "production" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) throw new Error("AUTH_URL is not set to the public address: sign-in links would point at localhost");
  return `${u.origin}/sign-in/confirm?next=${encodeURIComponent(`${u.pathname}${u.search}`)}`;
}
