import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createContact, updateContact } from "@/server/services/crm/contacts";
import { ensureMyPartnerCard } from "@/server/services/crm/people";
import { getSharing, getTeamActivity, setSharing, teamActivitySchema } from "@/server/services/crm/team-activity";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let shares: string;
let keeps: string;
let outsider: string;
let ws: { id: string };
const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const q = (days = 7) => teamActivitySchema.parse({ days });

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  shares = (await t.db.user.create({ data: { email: "s@x.io", name: "Shares", referredById: owner, referredAt: new Date() } })).id;
  keeps = (await t.db.user.create({ data: { email: "k@x.io", name: "Keeps", referredById: owner, referredAt: new Date() } })).id;
  outsider = (await t.db.user.create({ data: { email: "z@x.io", name: "Outsider" } })).id;
  ws = await createWorkspace(owner, "Team Co");
});
afterAll(async () => close());

describe("team activity", () => {
  it("shows the first line of partners with what the people they work with moved through, and leaves out the lower line", async () => {
    const self = (await ensureMyPartnerCard(owner, ws.id)).id;
    const partner = async (firstName: string, sponsorId: string | null) => {
      const id = (await createContact(owner, ws.id, { ...base, firstName, stage: "PARTNER" })).id;
      if (sponsorId) await raw.contact.update({ where: { nodeId: id }, data: { sponsorId } });
      return id;
    };
    const top = await partner("Top", self);
    const low = await partner("Low", top);
    await partner("Lone", null); // nobody sponsors them: also first line
    const hold = async (by: string, firstName: string, stage: "FIRST_CONTACT" | "PRESENTATION" | "CLIENT") => {
      const id = (await createContact(owner, ws.id, { ...base, firstName })).id;
      await raw.contact.update({ where: { nodeId: id }, data: { heldById: by } });
      await updateContact(owner, id, { stage });
      return id;
    };
    await hold(top, "A", "FIRST_CONTACT");
    await hold(top, "B", "PRESENTATION");
    await hold(top, "C", "CLIENT");
    await hold(low, "D", "PRESENTATION");

    const r = await getTeamActivity(owner, ws.id, q());
    expect(r.partners.map((p) => p.name).sort()).toEqual(["Lone", "Top"]); // "Low" is the second line, the self card is you
    const t = r.partners.find((p) => p.name === "Top")!;
    expect(t).toMatchObject({ status: "active", below: 1 });
    expect(t.counts).toMatchObject({ contacted: 1, presentations: 1, clients: 1 });
    expect(r.partners.find((p) => p.name === "Lone")).toMatchObject({ status: "never", lastAt: null });
    expect(low).toBeTruthy();
  });

  it("the period narrows what is counted, and a partner who has done nothing for a week is gone quiet", async () => {
    const later = new Date(Date.now() + 20 * 86_400_000);
    const r = await getTeamActivity(owner, ws.id, q(7), later);
    const t = r.partners.find((p) => p.name === "Top")!;
    expect(t.counts).toMatchObject({ contacted: 0, presentations: 0, clients: 0 });
    expect(t.status).toBe("gone");
    expect(r.totals.quiet).toBeGreaterThanOrEqual(1);
  });

  it("people from your link: numbers only after they agree, nothing before, and again nothing after they take it back", async () => {
    // both did some work in their own workspaces
    for (const [uid, name] of [[shares, "Sh"], [keeps, "Ke"]] as const) {
      const w = await createWorkspace(uid, `${name} Co`);
      const id = (await createContact(uid, w.id, { ...base, firstName: `${name}-person` })).id;
      await updateContact(uid, id, { stage: "PRESENTATION" });
    }
    let r = await getTeamActivity(owner, ws.id, q());
    expect(r.invitees.map((i) => [i.name, i.shared]).sort()).toEqual([["Keeps", false], ["Shares", false]]);
    expect(r.invitees.every((i) => i.counts === null && i.lastAt === null)).toBe(true); // privacy: not a number before the agreement

    expect(await getSharing(shares)).toMatchObject({ share: false, sponsor: { name: "Owner" } });
    await setSharing(shares, true);
    r = await getTeamActivity(owner, ws.id, q());
    const s = r.invitees.find((i) => i.name === "Shares")!;
    expect(s).toMatchObject({ shared: true, status: "active" });
    expect(s.counts).toMatchObject({ added: 1, presentations: 1 });
    expect(r.invitees.find((i) => i.name === "Keeps")).toMatchObject({ shared: false, counts: null });

    await setSharing(shares, false);
    expect((await getTeamActivity(owner, ws.id, q())).invitees.every((i) => i.counts === null)).toBe(true);
  });

  it("only a member sees it, and a person with nobody who invited them has nothing to share with", async () => {
    await expect(getTeamActivity(outsider, ws.id, q())).rejects.toBeTruthy();
    expect(await getSharing(outsider)).toEqual({ sponsor: null, share: false });
    expect(() => q(5)).toThrow();
  });
});
