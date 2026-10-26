import { db } from "../src/server/db";
import { seedDemoData } from "../src/server/services/demo-seed";

seedDemoData()
  .then(() => console.log("Seeded: demo@meetowl.local (owner), member@meetowl.local, workspace demo-studio with the New Product Launch demo project and a small CRM (companies, contacts, deals, a lead form)"))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
