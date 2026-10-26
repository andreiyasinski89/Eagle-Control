// Dev helper: prints a valid Auth.js session cookie for a seeded user (skips the magic-link email).
import { randomBytes } from "node:crypto";
import { db } from "../src/server/db";

async function main() {
  const email = process.argv[2] ?? "demo@meetowl.local";
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(24).toString("hex");
  await db.session.create({ data: { userId: user.id, sessionToken: token, expires: new Date(Date.now() + 7 * 864e5) } });
  console.log(token);
}

main().finally(() => db.$disconnect());
