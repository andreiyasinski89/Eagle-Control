// A mailbox for the browser tests, with no Docker: an SMTP server on :1025 that keeps what it is given, and the small part of Mailpit's HTTP API
// on :8025 that the tests read (search by recipient, one message with its text). If Mailpit is already running on those ports, use that instead.
// Usage: node scripts/e2e-mailbox.mjs     (SMTP_PORT / HTTP_PORT change the ports)
import http from "node:http";
import net from "node:net";

const SMTP_PORT = Number(process.env.SMTP_PORT ?? 1025);
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 8025);
/** @type {{ id: string, to: string[], subject: string, text: string }[]} newest first */
const mails = [];
let seq = 0;

/** The plain-text part of a raw message, with quoted-printable undone (long links are folded by the sender). */
function textOf(raw) {
  const split = raw.indexOf("\r\n\r\n");
  const head = split >= 0 ? raw.slice(0, split) : raw;
  const body = split >= 0 ? raw.slice(split + 4) : "";
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(head)?.[1];
  const part = boundary ? (body.split(`--${boundary}`).find((p) => /content-type:\s*text\/plain/i.test(p)) ?? body) : raw;
  const i = part.indexOf("\r\n\r\n");
  const partHead = boundary ? part.slice(0, i) : head;
  const partBody = boundary ? part.slice(i + 4) : body;
  const qp = /content-transfer-encoding:\s*quoted-printable/i.test(partHead);
  return qp ? partBody.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))) : partBody;
}

net
  .createServer((socket) => {
    let buf = "";
    let to = [];
    let inData = false;
    socket.write("220 e2e-mailbox ESMTP\r\n");
    socket.on("error", () => undefined);
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          const raw = buf.slice(0, end).replace(/\r\n\.\./g, "\r\n.");
          buf = buf.slice(end + 5);
          inData = false;
          mails.unshift({ id: String(++seq), to, subject: /^subject:\s*(.*)$/im.exec(raw)?.[1] ?? "", text: textOf(raw) });
          to = [];
          socket.write("250 OK queued\r\n");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) socket.write("250-e2e-mailbox\r\n250 8BITMIME\r\n");
        else if (cmd.startsWith("RCPT TO")) {
          to.push(/<([^>]+)>/.exec(line)?.[1]?.toLowerCase() ?? "");
          socket.write("250 OK\r\n");
        } else if (cmd.startsWith("DATA")) {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (cmd.startsWith("QUIT")) {
          socket.write("221 Bye\r\n");
          socket.end();
        } else socket.write("250 OK\r\n");
      }
    });
  })
  .listen(SMTP_PORT, "::", () => console.log(`e2e mailbox: SMTP on :${SMTP_PORT}`));

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (code, body) => (res.writeHead(code, { "content-type": "application/json" }), res.end(JSON.stringify(body)));
    if (url.pathname === "/api/v1/info") return send(200, { ok: true, messages: mails.length });
    if (url.pathname === "/api/v1/search") {
      const q = (url.searchParams.get("query") ?? "").replace(/^to:/i, "").toLowerCase();
      return send(200, { messages: mails.filter((m) => m.to.some((a) => a.includes(q))).map((m) => ({ ID: m.id, Subject: m.subject })) });
    }
    const one = /^\/api\/v1\/message\/(\d+)$/.exec(url.pathname);
    if (one) {
      const m = mails.find((x) => x.id === one[1]);
      return m ? send(200, { ID: m.id, Subject: m.subject, Text: m.text, To: m.to.map((Address) => ({ Address })) }) : send(404, { error: "not found" });
    }
    if (url.pathname === "/api/v1/messages" && req.method === "DELETE") return (mails.length = 0), send(200, { ok: true });
    send(404, { error: "not found" });
  })
  .listen(HTTP_PORT, () => console.log(`e2e mailbox: HTTP on :${HTTP_PORT}`));
