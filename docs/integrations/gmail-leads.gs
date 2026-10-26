/**
 * MeetOwl: leads from e-mail to the CRM (Google Apps Script, runs in your own Google account).
 *
 * What it does: every 5 minutes it looks in your Gmail for new e-mails from your website's form (the sender you set),
 * reads name, e-mail, phone and message out of them and sends each one to your MeetOwl lead webhook, where it becomes a
 * contact and a deal. Each e-mail is sent once. Nothing leaves your account except those leads, to your own MeetOwl address.
 *
 * Setup is in docs/INTEGRATIONS.md. In short: script.google.com → New project → paste this file →
 * Project Settings → Script properties: WEBHOOK_URL, WEBHOOK_TOKEN, LEAD_SENDER (optionally LEAD_SUBJECT, LEAD_SINCE) →
 * run `dryRun` once to see what it would send → run `installTrigger` once.
 */

var MAX_PER_RUN = 25;
var KEEP_IDS = 300;

/** The words that introduce each field in the e-mails forms produce (English, Russian, Polish). Lower case, without a colon. */
var FIELD_LABELS = {
  name: ["name", "full name", "your name", "contact name", "имя", "ваше имя", "фио", "imię", "imie"],
  email: ["email", "e-mail", "mail", "your email", "email address", "почта", "email адрес", "эл. почта", "электронная почта", "adres e-mail"],
  phone: ["phone", "tel", "telephone", "mobile", "phone number", "whatsapp", "телефон", "тел", "номер телефона", "telefon"],
  message: ["message", "comment", "comments", "text", "details", "wishes", "сообщение", "комментарий", "пожелания", "описание", "wiadomość", "wiadomosc"],
};

function fieldOf_(label) {
  var l = label.toLowerCase().replace(/[*\s]+$/g, "").replace(/^[*\s]+/g, "");
  for (var field in FIELD_LABELS) if (FIELD_LABELS[field].indexOf(l) !== -1) return field;
  return null;
}

var EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
var PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;

function addressOf_(header) {
  var m = /<([^>]+)>/.exec(header || "");
  return (m ? m[1] : header || "").trim().toLowerCase();
}

function displayNameOf_(header) {
  var m = /^\s*"?([^"<]+?)"?\s*</.exec(header || "");
  return m ? m[1].trim() : "";
}

/**
 * Turns one e-mail into the lead MeetOwl expects, or null when there is nothing to follow up (no e-mail and no phone).
 * `mail` is { subject, from, replyTo, to, body } as plain strings.
 */
function parseLeadEmail_(mail) {
  var lines = String(mail.body || "").replace(/\r/g, "").split("\n");
  var found = {};
  var extra = {};
  var current = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var m = /^\s*([^:：]{1,40}?)\s*[:：]\s*(.*)$/.exec(line);
    var field = m ? fieldOf_(m[1]) : null;
    if (m && field) {
      current = field;
      found[field] = (found[field] ? found[field] + "\n" : "") + m[2].trim();
    } else if (m && !field && m[2].trim() && m[1].length <= 30 && !/\s{2,}/.test(m[1])) {
      current = null;
      if (Object.keys(extra).length < 20) extra[m[1].trim()] = m[2].trim().slice(0, 300);
    } else if (current === "message" && line.trim()) {
      found.message += "\n" + line.trim();
    } else if (!line.trim()) {
      if (current !== "message") current = null;
    }
  }

  var own = [addressOf_(mail.from), addressOf_(mail.to)];
  var email = found.email ? (found.email.match(EMAIL_RE) || [""])[0].toLowerCase() : "";
  if (!email && mail.replyTo) {
    var reply = addressOf_(mail.replyTo);
    if (reply && own.indexOf(reply) === -1) email = reply;
  }
  if (!email) {
    var all = String(mail.body || "").match(EMAIL_RE) || [];
    for (var j = 0; j < all.length; j++) {
      if (own.indexOf(all[j].toLowerCase()) === -1) {
        email = all[j].toLowerCase();
        break;
      }
    }
  }
  var phone = found.phone ? (found.phone.match(PHONE_RE) || [""])[0].trim() : "";
  if (!phone) phone = ((String(mail.body || "").match(PHONE_RE) || [""])[0] || "").trim();
  if (!email && !phone) return null;

  var name = (found.name || "").split("\n")[0].trim() || displayNameOf_(mail.replyTo);
  var message = (found.message || "").trim() || String(mail.body || "").trim();
  var payload = { name: name, email: email, phone: phone, message: message.slice(0, 3000), source: "email", subject: String(mail.subject || "").slice(0, 200) };
  for (var k in extra) if (!(k in payload)) payload[k] = extra[k];
  return payload;
}

// ── Gmail and MeetOwl plumbing (only runs inside Google) ────────────────────

function settings_() {
  var p = PropertiesService.getScriptProperties();
  var c = { url: p.getProperty("WEBHOOK_URL"), token: p.getProperty("WEBHOOK_TOKEN"), sender: p.getProperty("LEAD_SENDER"), subject: p.getProperty("LEAD_SUBJECT") || "", since: p.getProperty("LEAD_SINCE") };
  if (!c.url || !c.token || !c.sender) throw new Error("Fill WEBHOOK_URL, WEBHOOK_TOKEN and LEAD_SENDER in Project Settings, Script properties.");
  if (!/^https:\/\//.test(c.url)) throw new Error("WEBHOOK_URL must start with https://");
  if (!c.since) {
    c.since = new Date().toISOString(); // only e-mails that arrive from now on, unless you set LEAD_SINCE yourself
    p.setProperty("LEAD_SINCE", c.since);
  }
  return c;
}

function searchQuery_(c) {
  var after = Math.floor(new Date(c.since).getTime() / 1000) - 3600;
  return "from:(" + c.sender + ")" + (c.subject ? " subject:(" + c.subject + ")" : "") + " after:" + after;
}

function toMail_(msg) {
  return { subject: msg.getSubject(), from: msg.getFrom(), replyTo: msg.getReplyTo(), to: msg.getTo(), body: msg.getPlainBody() };
}

/** Looks, but sends nothing and remembers nothing: run it first and read the log (View, Logs). */
function dryRun() {
  var c = settings_();
  var threads = GmailApp.search(searchQuery_(c), 0, 10);
  Logger.log("Search: " + searchQuery_(c) + " → " + threads.length + " conversation(s)");
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      var lead = parseLeadEmail_(toMail_(m));
      Logger.log(lead ? "WOULD SEND: " + JSON.stringify(lead) : "SKIPPED (no e-mail or phone found): " + m.getSubject());
    });
  });
}

function processLeads() {
  var c = settings_();
  var store = PropertiesService.getScriptProperties();
  var done = JSON.parse(store.getProperty("DONE_IDS") || "[]");
  var sent = 0;
  var threads = GmailApp.search(searchQuery_(c), 0, MAX_PER_RUN);
  for (var t = 0; t < threads.length && sent < MAX_PER_RUN; t++) {
    var messages = threads[t].getMessages();
    for (var i = 0; i < messages.length && sent < MAX_PER_RUN; i++) {
      var m = messages[i];
      var id = m.getId();
      if (done.indexOf(id) !== -1 || m.getDate().getTime() < new Date(c.since).getTime() - 3600000) continue;
      var lead = parseLeadEmail_(toMail_(m));
      if (lead) {
        var res = UrlFetchApp.fetch(c.url, {
          method: "post",
          contentType: "application/json",
          headers: { Authorization: "Bearer " + c.token, "Idempotency-Key": id },
          payload: JSON.stringify(lead),
          muteHttpExceptions: true,
        });
        var code = res.getResponseCode();
        var retryLater = code === 401 || code === 403 || code === 429 || code >= 500;
        if (retryLater) throw new Error("MeetOwl answered " + code + ": " + res.getContentText().slice(0, 200) + " (will try again at the next run)");
        if (code >= 400) Logger.log("MeetOwl refused one lead (" + code + "), not retrying: " + res.getContentText().slice(0, 200));
        sent++;
      } else {
        Logger.log("Skipped, no e-mail or phone found: " + m.getSubject());
      }
      done.push(id);
      store.setProperty("DONE_IDS", JSON.stringify(done.slice(-KEEP_IDS)));
    }
  }
  Logger.log("Sent " + sent + " lead(s).");
}

/** Run once: checks the e-mails every 5 minutes. */
function installTrigger() {
  settings_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processLeads") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("processLeads").timeBased().everyMinutes(5).create();
  Logger.log("Done: new lead e-mails are checked every 5 minutes.");
}

if (typeof module !== "undefined") module.exports = { parseLeadEmail_: parseLeadEmail_, fieldOf_: fieldOf_ };
