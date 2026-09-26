// International dialling codes for the countries most likely to appear on a
// Shopify address, so a local number written on a shipping label ("98765
// 43210", country IN) can become one WhatsApp can reach ("919876543210").
//
// Deliberately a short list, not every country: an unknown country leaves the
// number alone, and a number without a country code is then refused rather
// than guessed at (lib/contacts.ts).

const CALLING_CODES: Record<string, string> = {
  AE: "971", AR: "54", AT: "43", AU: "61", BD: "880", BE: "32", BR: "55",
  CA: "1", CH: "41", CL: "56", CN: "86", CO: "57", DE: "49", DK: "45",
  EG: "20", ES: "34", FI: "358", FR: "33", GB: "44", GH: "233", HK: "852",
  ID: "62", IE: "353", IL: "972", IN: "91", IT: "39", JP: "81", KE: "254",
  KR: "82", KW: "965", LK: "94", MX: "52", MY: "60", NG: "234", NL: "31",
  NO: "47", NP: "977", NZ: "64", OM: "968", PH: "63", PK: "92", PL: "48",
  PT: "351", QA: "974", SA: "966", SE: "46", SG: "65", TH: "66", TR: "90",
  TW: "886", UA: "380", US: "1", VN: "84", ZA: "27",
};

/** "IN" → "91". Null for a country not on the list. */
export function callingCodeFor(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null;

  return CALLING_CODES[countryCode.trim().toUpperCase()] ?? null;
}
