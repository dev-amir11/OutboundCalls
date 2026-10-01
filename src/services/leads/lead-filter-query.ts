import type { Prisma } from "@/generated/prisma/client";
import { getAppTimeZone } from "@/lib/zoned-time";
import { type LeadFilter, resolveLeadWindows } from "@/services/leads/lead-filter";

export function leadFilterToWhere(filter: LeadFilter, now = new Date(), timeZone = getAppTimeZone()): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];

  if (filter.search) {
    and.push({
      OR: [
        { name: { contains: filter.search, mode: "insensitive" } },
        { phone: { contains: filter.search, mode: "insensitive" } },
        { phoneNormalized: { contains: filter.search, mode: "insensitive" } },
        { email: { contains: filter.search, mode: "insensitive" } },
        { company: { contains: filter.search, mode: "insensitive" } },
      ],
    });
  }

  switch (filter.preset) {
    case "never_called":
      and.push({ callAttempts: 0 });
      break;
    case "called":
      and.push({ callAttempts: { gt: 0 } });
      break;
    case "successful":
      and.push({ lastCallStatus: "SUCCESSFUL" });
      break;
    case "failed":
      and.push({ lastCallStatus: "FAILED" });
      break;
    case "voicemail":
      and.push({ lastCallStatus: "VOICEMAIL" });
      break;
    case "no_answer":
      and.push({ lastCallStatus: "NO_ANSWER" });
      break;
    case "busy":
      and.push({ lastCallStatus: "BUSY" });
      break;
    case "in_progress":
      and.push({ activity: "IN_PROGRESS" });
      break;
    default:
      break;
  }

  const windows = resolveLeadWindows(filter, now, timeZone);
  if (windows.createdAt) and.push({ createdAt: windows.createdAt });
  if (windows.lastCallAt) and.push({ lastCallAt: windows.lastCallAt });
  if (windows.requiredOutcome) and.push({ lastCallStatus: windows.requiredOutcome });

  return and.length ? { AND: and } : {};
}
