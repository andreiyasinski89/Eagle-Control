import { describe, expect, it } from "vitest";
import { can, canGrantRole, canManageMember } from "@/server/policies";

describe("can", () => {
  it("lets only owners delete workspaces and manage billing", () => {
    expect(can({ role: "OWNER", crmAccess: false }, "workspace:delete")).toBe(true);
    expect(can({ role: "ADMIN", crmAccess: true }, "workspace:delete")).toBe(false);
    expect(can({ role: "ADMIN", crmAccess: true }, "billing:manage")).toBe(false);
  });

  it("lets owners and admins invite, not members", () => {
    expect(can({ role: "ADMIN", crmAccess: false }, "member:invite")).toBe(true);
    expect(can({ role: "MEMBER", crmAccess: true }, "member:invite")).toBe(false);
  });

  it("gates CRM by the separate flag for members", () => {
    expect(can({ role: "MEMBER", crmAccess: false }, "crm:read")).toBe(false);
    expect(can({ role: "MEMBER", crmAccess: true }, "crm:read")).toBe(true);
    expect(can({ role: "ADMIN", crmAccess: false }, "crm:read")).toBe(true);
  });

  it("never exposes CRM or the member list to guests and clients", () => {
    for (const role of ["GUEST", "CLIENT"] as const) {
      expect(can({ role, crmAccess: true }, "crm:read")).toBe(false);
      expect(can({ role, crmAccess: true }, "member:list")).toBe(false);
    }
  });
});

describe("canGrantRole", () => {
  it("never grants OWNER", () => {
    expect(canGrantRole("OWNER", "OWNER")).toBe(false);
  });
  it("lets owners grant everything below", () => {
    expect(canGrantRole("OWNER", "ADMIN")).toBe(true);
  });
  it("stops admins at admin level", () => {
    expect(canGrantRole("ADMIN", "ADMIN")).toBe(false);
    expect(canGrantRole("ADMIN", "MEMBER")).toBe(true);
  });
  it("denies members", () => {
    expect(canGrantRole("MEMBER", "GUEST")).toBe(false);
  });
});

describe("canManageMember", () => {
  it("lets admins manage lower roles only", () => {
    expect(canManageMember("ADMIN", "MEMBER")).toBe(true);
    expect(canManageMember("ADMIN", "ADMIN")).toBe(false);
    expect(canManageMember("ADMIN", "OWNER")).toBe(false);
  });
  it("stops admins promoting someone to admin", () => {
    expect(canManageMember("ADMIN", "MEMBER", "ADMIN")).toBe(false);
    expect(canManageMember("ADMIN", "MEMBER", "GUEST")).toBe(true);
  });
  it("lets owners do anything", () => {
    expect(canManageMember("OWNER", "ADMIN", "OWNER")).toBe(true);
  });
  it("denies members", () => {
    expect(canManageMember("MEMBER", "GUEST")).toBe(false);
  });
});
