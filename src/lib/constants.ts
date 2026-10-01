export const APP_NAME = "Outbound Calls";

export const CONCURRENCY_OPTIONS = [5, 10, 20, 30, 50, 60] as const;

export const PAGE_SIZE = 20;

export const LEAD_PRESETS = [
  { value: "all", label: "All" },
  { value: "never_called", label: "Never called" },
  { value: "called", label: "Called" },
  { value: "successful", label: "Successful" },
  { value: "failed", label: "Failed" },
  { value: "voicemail", label: "Voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "busy", label: "Busy" },
  { value: "in_progress", label: "In progress" },
] as const;

export const DATE_PRESETS = [
  { value: "", label: "Any date" },
  { value: "imported_today", label: "Imported today" },
  { value: "imported_yesterday", label: "Imported yesterday" },
  { value: "imported_this_week", label: "Imported this week" },
  { value: "called_today", label: "Called today" },
  { value: "failed_today", label: "Failed today" },
  { value: "failed_yesterday", label: "Failed yesterday" },
  { value: "no_answer_yesterday", label: "No answer yesterday" },
  { value: "voicemail_yesterday", label: "Voicemail yesterday" },
] as const;

export const CALL_DATE_PRESETS = [
  { value: "", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
] as const;

export const OUTCOME_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "SUCCESSFUL", label: "Successful" },
  { value: "VOICEMAIL", label: "Voicemail" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "BUSY", label: "Busy" },
  { value: "FAILED", label: "Failed" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export const ANSWER_TYPE_OPTIONS = [
  { value: "", label: "Any answer type" },
  { value: "ANSWERED_HUMAN", label: "Human" },
  { value: "ANSWERING_MACHINE", label: "Answering machine" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "BUSY", label: "Busy" },
  { value: "FAILED", label: "Failed" },
] as const;

export const MOCK_RESULT_OPTIONS = [
  { value: "RANDOM", label: "Random (development mix)" },
  { value: "ANSWERED", label: "ANSWERED — human" },
  { value: "VOICEMAIL", label: "VOICEMAIL" },
  { value: "NO_ANSWER", label: "NO_ANSWER" },
  { value: "BUSY", label: "BUSY" },
  { value: "FAILED", label: "FAILED" },
] as const;

export type LeadPreset = (typeof LEAD_PRESETS)[number]["value"];
export type DatePreset = (typeof DATE_PRESETS)[number]["value"];
