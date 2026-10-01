import { getAppTimeZone } from "@/lib/zoned-time";

export function labelize(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatDuration(totalSeconds: number | null | undefined) {
  if (totalSeconds == null || Number.isNaN(totalSeconds) || totalSeconds < 0) return "—";
  const seconds = Math.floor(totalSeconds);
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${remainder}`;
}

export function elapsedSeconds(startedAt: Date | string | null, endedAt?: Date | string | null, now = new Date()) {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : now.getTime();
  return Math.max(0, Math.round((end - start) / 1000));
}

export function formatDateTime(value: Date | string | null | undefined, timeZone = getAppTimeZone()) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: Date | string | null | undefined, timeZone = getAppTimeZone()) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

export function pageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw ?? 1);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
