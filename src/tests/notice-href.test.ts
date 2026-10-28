import { describe, expect, it } from "vitest";
import { noticeHref } from "@/lib/notice-href";

describe("where a notification leads", () => {
  it("keeps its place inside the workspace", () => {
    expect(noticeHref("acme", "/settings/billing")).toBe("/w/acme/settings/billing");
    expect(noticeHref("acme", "/projects/p/1?node=2")).toBe("/w/acme/projects/p/1?node=2");
  });

  it("leaves pages outside any workspace as they are: the account page (the invitation link notice) and the client portal", () => {
    expect(noticeHref("acme", "/account")).toBe("/account");
    expect(noticeHref("acme", "/account?tab=invite")).toBe("/account?tab=invite");
    expect(noticeHref("acme", "/portal/abc")).toBe("/portal/abc");
  });

  it("does not take a workspace page that merely starts the same way for an outside one", () => {
    expect(noticeHref("acme", "/accounts")).toBe("/w/acme/accounts");
  });
});
