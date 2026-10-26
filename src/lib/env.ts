import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  MAIL_FROM: z.string().default("MeetOwl <noreply@meetowl.local>"),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** TLS from the first byte (port 465). Unset: on for port 465, off otherwise (587 upgrades with STARTTLS when a login is set). */
  SMTP_SECURE: z.preprocess((v) => (v === undefined || v === "" ? undefined : v === "true" || v === "1"), z.boolean().optional()),
  /** Sign-in e-mails the whole installation sends per day (Gmail allows about 500). */
  MAIL_DAILY_LIMIT: z.coerce.number().int().min(1).default(300),
  /** Comma-separated e-mail addresses whose owned workspaces get the Pro plan without Stripe. */
  PRO_OWNER_EMAILS: z.string().optional(),
  /** Shown in the privacy policy and terms as the party responsible for the service. */
  LEGAL_OPERATOR_NAME: z.string().optional(),
  LEGAL_CONTACT_EMAIL: z.string().optional(),
  SECRETS_KEY: z.string().optional(),
  ACCOUNT_DELETION_GRACE_DAYS: z.coerce.number().int().min(0).max(30).default(7),
  DEMO_MODE: z.preprocess((v) => v === "true" || v === "1", z.boolean()),
  CRON_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(16).optional()),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  JOBS_MODE: z.enum(["inline", "inngest"]).optional(),
  REALTIME_PROVIDER: z.enum(["sse", "liveblocks"]).default("sse"),
  LIVEBLOCKS_SECRET_KEY: z.string().optional(),
  GOOGLE_CAL_CLIENT_ID: z.string().optional(),
  GOOGLE_CAL_CLIENT_SECRET: z.string().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-sonnet-5-5"),
  AI_PROVIDER: z.enum(["anthropic", "mock"]).optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().default("meetowl"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment; throws a readable error on first access if misconfigured. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
    }
    cached = parsed.data;
  }
  return cached;
}
