/** The cookie (read by the server) and the storage key (read in the browser) that say "this is the Android app from Google Play". */
export const ANDROID_COOKIE = "mlm_app";
export const ANDROID_KEY = "meetowl:android-app";

/**
 * Whether this visit comes from the Android app: its start address carries ?app=android, and Android sets the referrer
 * android-app://<package> on the first page. Google Play does not allow the app to sell a subscription past Play's own billing
 * or to send people to pay elsewhere, so in the app the payment buttons and links are not shown.
 */
export function cameFromAndroidApp(search: string, referrer: string): boolean {
  return new URLSearchParams(search).get("app") === "android" || referrer.startsWith("android-app://");
}
