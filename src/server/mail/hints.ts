/**
 * What the site sees in its mail settings, and what looks wrong in it, for the platform owner when a mail does not go. Never the password itself:
 * only its length and whether it has the shape of a Gmail app password (16 small letters).
 */
export interface MailSettings {
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER?: string | undefined;
  SMTP_PASS?: string | undefined;
  RESEND_API_KEY?: string | undefined;
  /** The sender: "Name <address>" or an address. */
  MAIL_FROM?: string | undefined;
}

export interface MailHints {
  /** One line of what the site sees, with the address half hidden and no password. */
  seen: string;
  /** What looks wrong, as codes the page turns into plain words. */
  codes: string[];
}

const maskUser = (u: string) => {
  const [name = "", domain = ""] = u.trim().split("@");
  return domain ? `${name.slice(0, 2)}***@${domain}` : u.trim().slice(0, 2) + "***";
};

export function mailSettingsHints(s: MailSettings): MailHints {
  const codes: string[] = [];
  const user = s.SMTP_USER ?? "";
  const pass = s.SMTP_PASS ?? "";
  const bare = pass.replace(/\s/g, "");

  const resend = !!s.RESEND_API_KEY?.trim();
  const fromDomain = (/<([^>]+)>/.exec(s.MAIL_FROM ?? "")?.[1] ?? s.MAIL_FROM ?? "").trim().split("@")[1]?.toLowerCase() ?? "";
  const tail = `${resend ? " · Resend" : ""}${fromDomain ? ` · from @${fromDomain}` : ""}`;
  // Resend sends only from a domain verified in it; a free mailbox address as the sender is refused ("the gmail.com domain is not verified").
  const fromFree = resend && /^(gmail|googlemail|yahoo|outlook|hotmail|icloud|yandex|mail)\./.test(fromDomain);
  // Resend with no mailbox beside it has nothing to fall back on: its key and its verified domain are all the mail depends on. The mailbox is not judged then.
  if (resend && !user.trim() && !pass) return { seen: `${s.SMTP_HOST}:${s.SMTP_PORT} · — · 0${tail}`, codes: [...(fromFree ? ["from_free"] : []), "resend_wins"] };
  if (fromFree) codes.push("from_free");
  if (!user.trim()) codes.push("user_missing");
  else if (user.trim() === "SMTP_USER") codes.push("user_is_name");
  else if (user !== user.trim() || /["']/.test(user)) codes.push("user_stray");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user)) codes.push("user_not_email");

  if (!pass) codes.push("pass_missing");
  else if (pass.trim() === "SMTP_PASS") codes.push("pass_is_name");
  else {
    if (pass !== pass.trim() || /["'\r\n]/.test(pass)) codes.push("pass_stray");
    if (bare.length !== 16) codes.push("pass_length");
    else if (/[^a-z]/.test(bare)) codes.push("pass_chars");
    if (/\s/.test(pass.trim())) codes.push("pass_spaces");
  }

  if (/@(gmail|googlemail)\.com$/i.test(user.trim()) && s.SMTP_HOST.trim().toLowerCase() !== "smtp.gmail.com") codes.push("host_not_gmail");
  if (s.SMTP_HOST.trim().toLowerCase() === "smtp.gmail.com" && ![465, 587].includes(s.SMTP_PORT)) codes.push("port_not_gmail");

  const seen = `${s.SMTP_HOST}:${s.SMTP_PORT} · ${user ? maskUser(user) : "—"} · ${pass ? `${bare.length}` : "0"}${tail}`;
  return { seen, codes };
}
