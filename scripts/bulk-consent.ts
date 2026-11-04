// Marks consent as given for contacts that have none, as an owner attestation (see src/server/services/crm/consent-bulk.ts).
// Usage: npx tsx scripts/bulk-consent.ts --workspace <slug> --as <your e-mail> [--owner <contacts' owner e-mail>] [--apply]
// Without --apply it only reports. It uses DATABASE_URL from the environment: check which database that is before --apply.
import { db } from "../src/server/db";
import { ATTESTED_SOURCE, bulkAttestConsent } from "../src/server/services/crm/consent-bulk";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg("workspace");
  const email = arg("as");
  if (!slug || !email) throw new Error("Usage: tsx scripts/bulk-consent.ts --workspace <slug> --as <e-mail> [--owner <e-mail>] [--apply]");
  const apply = process.argv.includes("--apply");
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true, name: true } });
  const user = await db.user.findUniqueOrThrow({ where: { email: email.toLowerCase() }, select: { id: true } });
  const ownerEmail = arg("owner");
  const owner = ownerEmail ? await db.user.findUniqueOrThrow({ where: { email: ownerEmail.toLowerCase() }, select: { id: true } }) : null;

  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").host;
    } catch {
      return "unknown";
    }
  })();
  console.log(`Database: ${host}\nWorkspace: ${ws.name} (${slug})${owner ? `, contacts of ${ownerEmail}` : ", all contacts"}\nMode: ${apply ? "APPLY" : "dry run (nothing is written)"}\n`);

  const r = await bulkAttestConsent(user.id, ws.id, { ...(owner ? { ownerId: owner.id } : {}), apply });
  console.log(`Already have consent: ${r.alreadyGiven}`);
  console.log(`${apply ? "Consent set" : "Would set consent"}: ${r.toSet.length}${apply ? ` (done: ${r.applied}, source "${ATTESTED_SOURCE}")` : ""}`);
  console.log(`Skipped, they withdrew consent earlier: ${r.skippedRevoked.length}`);
  for (const c of r.skippedRevoked) console.log(`  - ${c.name} (${c.id})`);
  if (!apply) console.log(`\nSample of those that would change:\n${r.toSet.slice(0, 15).map((c) => `  - ${c.name}`).join("\n")}\n\nAdd --apply to write.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
