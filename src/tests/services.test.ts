import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    membership: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(), update: vi.fn(), delete: vi.fn() },
    workspace: { findUnique: vi.fn() },
    teamMember: { deleteMany: vi.fn() },
    team: { updateMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    invitation: { updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
  sendMail: vi.fn(),
}));

vi.mock("@/server/db", () => ({ db: mocks.db }));
vi.mock("@/server/mail", () => ({ sendMail: mocks.sendMail }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "http://app.test" }) }));

import { createInvitation } from "@/server/services/invitation";
import { removeMember, updateMember } from "@/server/services/membership";

const { db } = mocks;
const owner = { userId: "u1", role: "OWNER" as const };

beforeEach(() => vi.resetAllMocks());

describe("membership guards", () => {
  it("refuses to demote the last owner", async () => {
    db.membership.findUnique.mockResolvedValue({ id: "m1", role: "OWNER" });
    db.membership.count.mockResolvedValue(1);
    await expect(updateMember(owner, "w1", "u1", { role: "ADMIN" })).rejects.toMatchObject({ code: "last_owner" });
    expect(db.membership.update).not.toHaveBeenCalled();
  });

  it("refuses to remove the last owner", async () => {
    db.membership.findUnique.mockResolvedValue({ id: "m1", role: "OWNER" });
    db.membership.count.mockResolvedValue(1);
    await expect(removeMember(owner, "w1", "u1")).rejects.toMatchObject({ code: "last_owner" });
  });

  it("stops an admin from changing an owner", async () => {
    db.membership.findUnique.mockResolvedValue({ id: "m1", role: "OWNER" });
    await expect(updateMember({ userId: "u2", role: "ADMIN" }, "w1", "u1", { crmAccess: true })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("lets a member leave on their own", async () => {
    db.membership.findUnique.mockResolvedValue({ id: "m2", role: "MEMBER" });
    await removeMember({ userId: "u2", role: "MEMBER" }, "w1", "u2");
    expect(db.membership.delete).toHaveBeenCalledWith({ where: { id: "m2" } });
  });
});

describe("createInvitation", () => {
  const base = {
    workspaceId: "w1",
    actor: owner,
    email: " New@Example.com ",
    role: "MEMBER" as const,
    crmAccess: false,
    projectIds: [],
  };

  it("blocks inviting beyond the Free plan user limit (members + pending)", async () => {
    db.workspace.findUnique.mockResolvedValue({ id: "w1", name: "W", plan: "FREE" });
    db.membership.findFirst.mockResolvedValue(null);
    db.membership.count.mockResolvedValue(4);
    db.invitation.count.mockResolvedValue(1);
    await expect(createInvitation(base)).rejects.toMatchObject({ status: 402, code: "plan_limit" });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("rejects people who are already members", async () => {
    db.workspace.findUnique.mockResolvedValue({ id: "w1", name: "W", plan: "FREE" });
    db.membership.findFirst.mockResolvedValue({ id: "m" });
    await expect(createInvitation(base)).rejects.toMatchObject({ code: "already_member" });
  });

  it("forbids granting OWNER", async () => {
    await expect(createInvitation({ ...base, role: "OWNER" })).rejects.toMatchObject({ status: 403 });
  });

  it("stores only a token hash and emails a link with the raw token", async () => {
    db.workspace.findUnique.mockResolvedValue({ id: "w1", name: "W", plan: "PRO" });
    db.membership.findFirst.mockResolvedValue(null);
    db.membership.count.mockResolvedValue(1);
    db.invitation.count.mockResolvedValue(0);
    db.invitation.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "i1", ...data }));

    await createInvitation(base);

    const stored = db.invitation.create.mock.calls[0]?.[0].data as { tokenHash: string; email: string };
    const mail = mocks.sendMail.mock.calls[0]?.[0] as { text: string; to: string };
    const token = mail.text.match(/invite\/(\S+)/)?.[1] ?? "";
    expect(stored.email).toBe("new@example.com");
    expect(mail.to).toBe("new@example.com");
    expect(token.length).toBeGreaterThan(30);
    expect(stored.tokenHash).not.toContain(token);
  });
});
