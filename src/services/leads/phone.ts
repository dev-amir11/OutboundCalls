import { parsePhoneNumberFromString } from "libphonenumber-js";

export type PhoneResult =
  | { ok: true; e164: string; display: string }
  | { ok: false; reason: string };

export function normalizePhone(raw: string, defaultCountry: "US" = "US"): PhoneResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "Phone is required." };
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isPossible()) {
    return { ok: false, reason: "Phone number could not be normalized." };
  }
  return {
    ok: true,
    e164: parsed.number,
    display: parsed.formatInternational(),
  };
}
