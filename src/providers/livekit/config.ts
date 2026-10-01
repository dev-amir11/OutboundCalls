export type SetupItem = {
  id: string;
  label: string;
  configured: boolean;
};

export type LiveKitTrunkConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
  fromNumber: string;
  trunkId: string | null;
  sipAddress: string;
  sipUsername: string;
  sipPassword: string;
};

const TRUNK_NAME = "outbound-calls-telnyx";

export function liveKitRoomName(callId: string) {
  return `oc-${callId}`;
}

export function normalizeLiveKitHost(url: string) {
  return url.trim().replace(/\/$/, "").replace(/^ws:/i, "http:").replace(/^wss:/i, "https:");
}

export function normalizeSipAddress(address: string) {
  return address
    .trim()
    .replace(/^sip:/i, "")
    .replace(/^sips:/i, "")
    .replace(/\/$/, "");
}

export function liveKitSetupItems(env: Record<string, string | undefined> = process.env): SetupItem[] {
  const trunkId = env.LIVEKIT_SIP_TRUNK_ID?.trim();
  return [
    { id: "LIVEKIT_URL", label: "LiveKit URL", configured: Boolean(env.LIVEKIT_URL?.trim()) },
    { id: "LIVEKIT_API_KEY", label: "LiveKit API key", configured: Boolean(env.LIVEKIT_API_KEY?.trim()) },
    { id: "LIVEKIT_API_SECRET", label: "LiveKit API secret", configured: Boolean(env.LIVEKIT_API_SECRET?.trim()) },
    { id: "TELNYX_PHONE_NUMBER", label: "Telnyx caller ID", configured: Boolean(env.TELNYX_PHONE_NUMBER?.trim()) },
    {
      id: "LIVEKIT_SIP_TRUNK_ID",
      label: "LiveKit outbound trunk",
      configured: Boolean(trunkId) || Boolean(env.TELNYX_SIP_USERNAME?.trim() && env.TELNYX_SIP_PASSWORD?.trim()),
    },
  ];
}

export function readLiveKitTrunkConfig(env: Record<string, string | undefined> = process.env): LiveKitTrunkConfig {
  const missing = liveKitSetupItems(env).filter((item) => !item.configured).map((item) => item.id);
  if (missing.length) {
    throw new Error(`LiveKit outbound calling is missing ${missing.join(", ")}. Add them to the environment, or keep TELEPHONY_PROVIDER=mock.`);
  }
  const url = env.LIVEKIT_URL?.trim() ?? "";
  const apiKey = env.LIVEKIT_API_KEY?.trim() ?? "";
  const apiSecret = env.LIVEKIT_API_SECRET?.trim() ?? "";
  const fromNumber = env.TELNYX_PHONE_NUMBER?.trim() ?? "";
  return {
    url: normalizeLiveKitHost(url),
    apiKey,
    apiSecret,
    fromNumber,
    trunkId: env.LIVEKIT_SIP_TRUNK_ID?.trim() || null,
    sipAddress: normalizeSipAddress(env.TELNYX_SIP_ADDRESS?.trim() || "sip.telnyx.com"),
    sipUsername: env.TELNYX_SIP_USERNAME?.trim() ?? "",
    sipPassword: env.TELNYX_SIP_PASSWORD?.trim() ?? "",
  };
}

export function outboundTrunkName() {
  return TRUNK_NAME;
}

export function activeTelephonyProvider(env: Record<string, string | undefined> = process.env) {
  return (env.TELEPHONY_PROVIDER ?? "mock").trim().toLowerCase() || "mock";
}
