export const PLACE_CALL_AMD_AGENT = "place-call-amd";

export type AmdCategory =
  | "human"
  | "machine-ivr"
  | "machine-vm"
  | "machine-unavailable"
  | "uncertain";

export type AmdDataMessage = {
  type: "amd";
  category: AmdCategory;
  transcript?: string;
  reason?: string;
  /** Original LiveKit AMD category before local phrase override. */
  rawCategory?: AmdCategory;
};

export type SttLogMessage = {
  type: "stt";
  transcript: string;
  isFinal: boolean;
};

const VOICEMAIL_PHRASES = [
  "record your message",
  "leave a message",
  "leave your message",
  "after the beep",
  "after the tone",
  "at the tone",
  "not available",
  "can't come to the phone",
  "cannot come to the phone",
  "unable to take your call",
  "mailbox",
  "voicemail",
  "voice mail",
  "please leave",
  "no one is available",
  "forwarded to an automatic",
  "person you are trying to reach",
  "the person you called",
  "is not available",
  "busy or unavailable",
  "trying to call is busy",
];

/** High-confidence phrases — safe to settle AMD immediately without waiting for silence. */
const VOICEMAIL_EARLY_PHRASES = [
  "leave a message after the beep",
  "leave your message after the beep",
  "leave a message after the tone",
  "record your message after the beep",
  "record your message after the tone",
  "please leave a message after the",
  "at the tone, please record",
  "at the tone please record",
  "forwarded to an automatic voice message",
];

export function isAmdDataMessage(value: unknown): value is AmdDataMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.type !== "amd") return false;
  const category = record.category;
  return (
    category === "human" ||
    category === "machine-ivr" ||
    category === "machine-vm" ||
    category === "machine-unavailable" ||
    category === "uncertain"
  );
}

export function isSttLogMessage(value: unknown): value is SttLogMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.type === "stt" && typeof record.transcript === "string";
}

export function talkCategories(category: AmdCategory) {
  return category === "human" || category === "uncertain" || category === "machine-ivr";
}

/** Phrase-based override when STT clearly heard a voicemail greeting. */
export function looksLikeVoicemail(transcript: string | undefined | null) {
  const text = (transcript ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return false;
  return VOICEMAIL_PHRASES.some((phrase) => text.includes(phrase));
}

/** Strong enough to abort AMD early (do not wait for greeting silence / LLM). */
export function looksLikeVoicemailEarly(transcript: string | undefined | null) {
  const text = (transcript ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return false;
  if (VOICEMAIL_EARLY_PHRASES.some((phrase) => text.includes(phrase))) return true;
  // Two weaker signals together (e.g. "leave a message" + "after the beep").
  const hits = VOICEMAIL_PHRASES.filter((phrase) => text.includes(phrase));
  return hits.length >= 2;
}

export function refineAmdCategory(category: AmdCategory, transcript?: string | null): {
  category: AmdCategory;
  reason?: string;
} {
  if (looksLikeVoicemail(transcript) && category !== "machine-vm" && category !== "machine-unavailable") {
    return {
      category: "machine-vm",
      reason: `stt_voicemail_phrase (was ${category})`,
    };
  }
  return { category };
}

export const AMD_CLASSIFIER_PROMPT = `You classify the start of an outbound phone call.

Prefer machine-vm when the audio is a voicemail / answering-machine greeting, even if it is short.
Strong machine-vm signals include phrases like:
- "record your message"
- "leave a message" / "leave your message"
- "after the beep" / "after the tone"
- "the person you are trying to reach"
- "is not available" / "can't come to the phone"
- "mailbox" / "voicemail"

Use human only when a live person is greeting conversationally (hello, hi, who's this, speaking).
Use machine-ivr for press-1 menus.
Use machine-unavailable when the mailbox is full or cannot accept messages.
Use uncertain only when there is no useful speech.`;
