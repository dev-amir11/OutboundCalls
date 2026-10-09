export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function buildDialString(e164: string, prefix: string) {
  return `${digitsOnly(prefix)}${digitsOnly(e164)}`;
}

/** When usePrefix is false, dial the E.164 digits only (no carrier prefix). */
export function buildDialStringWithOption(e164: string, prefix: string, usePrefix: boolean) {
  return usePrefix ? buildDialString(e164, prefix) : digitsOnly(e164);
}

export function disconnectReasonLabel(reason: number | string | undefined | null) {
  if (reason === undefined || reason === null || reason === "") return null;
  if (typeof reason === "string" && !/^\d+$/.test(reason)) {
    // LiveKit sets UNKNOWN_REASON (0) on still-connected SIP legs — ignore noise.
    if (reason === "UNKNOWN_REASON" || reason === "0") return null;
    return reason;
  }
  const map: Record<number, string> = {
    1: "CLIENT_INITIATED",
    2: "DUPLICATE_IDENTITY",
    3: "SERVER_SHUTDOWN",
    4: "PARTICIPANT_REMOVED",
    5: "ROOM_DELETED",
    6: "STATE_MISMATCH",
    7: "JOIN_FAILURE",
    8: "MIGRATION",
    9: "SIGNAL_CLOSE",
    10: "ROOM_CLOSED",
    11: "USER_UNAVAILABLE",
    12: "USER_REJECTED",
    13: "SIP_TRUNK_FAILURE",
    14: "CONNECTION_TIMEOUT",
    15: "MEDIA_FAILURE",
    16: "AGENT_ERROR",
  };
  const n = typeof reason === "string" ? Number(reason) : reason;
  if (n === 0 || Number.isNaN(n)) return null;
  return map[n] ?? `REASON_${n}`;
}

export function browserLiveKitUrl(url: string) {
  const trimmed = url.trim().replace(/\/$/, "");
  if (/^https?:/i.test(trimmed)) return trimmed.replace(/^http/i, "ws");
  if (/^wss?:/i.test(trimmed)) return trimmed;
  return `ws://${trimmed}`;
}
