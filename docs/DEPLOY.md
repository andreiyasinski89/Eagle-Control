# Publish a demo (Vercel + Neon, free)

This gives you a link anyone can open and click through without installing anything. It is a **showcase, not a production
setup**: everybody who opens it shares one sample workspace (reset every day), there is no e-mail, file storage, billing or
integrations. For a real installation follow [PRODUCTION.md](PRODUCTION.md).

## 1. A database (Neon)

1. Sign up at neon.tech, create a project (any name, nearest region).
2. On the project page open **Connect**. Turn **Connection pooling off** and copy the connection string
   (it starts with `postgresql://` and ends with `?sslmode=require`). This is your `DATABASE_URL`.
   Migrations need the direct (unpooled) address.

## 2. The app (Vercel)

1. Sign up at vercel.com with your GitHub account.
2. **Add New → Project**, pick this repository, leave the framework as **Next.js**.
3. Before pressing Deploy, open **Environment Variables** and add:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the Neon string from step 1 |
| `AUTH_SECRET` | any long random text (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) |
| `AUTH_TRUST_HOST` | `true` |
| `DEMO_MODE` | `true` |
| `CRON_SECRET` | any random text of 16+ characters (Vercel sends it to the daily reset) |

4. Press **Deploy**. The build applies the database migrations (`vercel-build`) and takes a few minutes.
5. Open the address Vercel shows (`https://<name>.vercel.app`), press **Open the demo**. The first visit builds the sample data and takes a few seconds.
6. Optional: add `APP_URL` with that address so links in notifications point to it, then redeploy.

## What the demo does and does not do

- Works: mind map, views, CRM, time, reports, AI answers (canned, no key), client portal preview, account page.
- Reset daily at 03:00 UTC (`vercel.json`, job `demo/reset`).
- Not available without more setup: sign-in by e-mail, invitations, attachments, Google/Slack/Telegram, billing. See `.env.example`.
- Live updates between several people may lag: the realtime layer is in memory and Vercel runs many small instances.
- Never put real data in a demo. Turn `DEMO_MODE` off (or delete the project) when you are done.
