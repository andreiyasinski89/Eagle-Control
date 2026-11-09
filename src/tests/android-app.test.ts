import { describe, expect, it, vi } from "vitest";
import { cameFromAndroidApp } from "@/modules/app/android";

describe("the Android app is recognised", () => {
  it("by its start address or by Android's referrer, and not otherwise", () => {
    expect(cameFromAndroidApp("?app=android", "")).toBe(true);
    expect(cameFromAndroidApp("", "android-app://app.mlmcrm.twa/")).toBe(true);
    expect(cameFromAndroidApp("?to=touches", "https://google.com/")).toBe(false);
  });
});

describe("Digital Asset Links", () => {
  it("lists the app with its fingerprints once they are set, and nothing before", async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", ANDROID_PACKAGE_NAME: "", ANDROID_SHA256_FINGERPRINTS: "" });
    let { GET } = await import("@/app/.well-known/assetlinks.json/route");
    expect(await GET().json()).toEqual([]);
    vi.resetModules();
    const fp = Array.from({ length: 32 }, (_, i) => (i % 16).toString(16).repeat(2)).join(":");
    Object.assign(process.env, { ANDROID_PACKAGE_NAME: "app.mlmcrm.twa", ANDROID_SHA256_FINGERPRINTS: `${fp.toLowerCase()}, not-a-print` });
    ({ GET } = await import("@/app/.well-known/assetlinks.json/route"));
    expect(await GET().json()).toEqual([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "app.mlmcrm.twa", sha256_cert_fingerprints: [fp.toUpperCase()] } }]);
  });
});
