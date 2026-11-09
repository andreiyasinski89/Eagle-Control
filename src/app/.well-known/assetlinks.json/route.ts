import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Digital Asset Links: tells Android that the MLM CRM app from Google Play may open this site full screen (a Trusted Web Activity), without a
 * browser bar. The package name and the SHA-256 fingerprint(s) of the signing key come from the environment (Play Console → App integrity);
 * until they are set the list is empty and the app would show a browser bar.
 */
export function GET() {
  const pkg = env().ANDROID_PACKAGE_NAME?.trim();
  const prints = (env().ANDROID_SHA256_FINGERPRINTS ?? "").split(",").map((f) => f.trim().toUpperCase()).filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  const body = pkg && prints.length ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: prints } }] : [];
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });
}
