// Makes the key pair of the backup, on this machine.
//   npx tsx scripts/backup/keygen.ts [--out <file>]
// The PRIVATE key is written to a file (by default on the Desktop) and never printed; the PUBLIC key is printed, and is the only thing the backup needs.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { generateAgeKeyPair } from "./age-key";

const argOut = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : undefined;
const out = argOut ?? path.join(homedir(), "Desktop", "MLM-CRM-backup-PRIVATE-KEY.txt");
if (existsSync(out)) {
  console.error(`The file ${out} already exists: it is not overwritten (a key lost is every backup lost). Move it away first, or choose another name with --out.`);
  process.exit(1);
}
const { recipient, identity } = generateAgeKeyPair();
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(
  out,
  `# MLM CRM backups: the PRIVATE key. Whoever has it can read every backup; without it nobody can.\n# Keep it in a password manager and on paper, in two places. Do not send it anywhere.\n# The public key (the one the backup uses to lock the files): ${recipient}\n${identity}\n`,
  { mode: 0o600 },
);
console.log("Done.");
console.log(`The PRIVATE key is in this file (open it, copy it into the password manager, then delete the file): ${out}`);
console.log(`The PUBLIC key (safe to share, put it into GitHub as BACKUP_AGE_RECIPIENT): ${recipient}`);
