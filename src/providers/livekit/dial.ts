export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function buildDialString(e164: string, prefix: string) {
  return `${digitsOnly(prefix)}${digitsOnly(e164)}`;
}

export function browserLiveKitUrl(url: string) {
  const trimmed = url.trim().replace(/\/$/, "");
  if (/^https?:/i.test(trimmed)) return trimmed.replace(/^http/i, "ws");
  if (/^wss?:/i.test(trimmed)) return trimmed;
  return `ws://${trimmed}`;
}
