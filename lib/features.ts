// Which of the 2026-09 integrations are switched on.
//
// Every one of them is off unless its flag is set to "true" in the
// environment, and most also need their provider's keys before they do
// anything. That is deliberate: several of these add webhook endpoints or
// change what happens to a live inbound message, and a deploy of this code
// must not change a single running conversation until the owner says so.
//
// Relative-import safe (no "@/"), because the message router and the job
// runner on the always-on host read these too.

export type FeatureName =
  | "shopify"
  | "paymentLinks"
  | "googleSheets"
  | "calendly"
  | "aiInsights"
  | "catalogSearch"
  /// When on, the router runs a lightweight sentiment check on every inbound
  /// text message and raises HIGH-priority threads for angry/urgent customers.
  | "voiceMedia"
  /// When on, owners can enable automatic conversation backups to their own
  /// Google Drive before the 7-day cleanup deletes them.
  | "googleDriveBackup";

const FLAG_VARIABLES: Record<FeatureName, string> = {
  shopify: "FEATURE_SHOPIFY",
  paymentLinks: "FEATURE_PAYMENT_LINKS",
  googleSheets: "FEATURE_GOOGLE_SHEETS",
  calendly: "FEATURE_CALENDLY",
  aiInsights: "FEATURE_AI_INSIGHTS",
  catalogSearch: "FEATURE_CATALOG_SEARCH",
  voiceMedia: "FEATURE_VOICE_MEDIA",
  googleDriveBackup: "FEATURE_GOOGLE_DRIVE_BACKUP",
};

/** True only when the flag is literally "true" (or "1"). Unset means off. */
export function isFeatureEnabled(name: FeatureName): boolean {
  const value = process.env[FLAG_VARIABLES[name]]?.trim().toLowerCase();

  return value === "true" || value === "1";
}

/** Plain-English wording for a feature that is switched off. */
export const FEATURE_OFF_MESSAGE =
  "This feature isn't switched on for this ChatWise installation yet.";

/**
 * The address the outside world reaches this app at, without a trailing
 * slash. Every OAuth redirect and webhook URL we hand a provider is built on
 * it, so it must be the real public address, not localhost, in production.
 */
export function publicAppUrl(): string {
  const url = process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000";

  return url.replace(/\/$/, "");
}
