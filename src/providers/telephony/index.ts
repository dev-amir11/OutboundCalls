import { LiveKitTelephonyProvider } from "@/providers/livekit/livekit-telephony-provider";
import { activeTelephonyProvider } from "@/providers/livekit/config";
import { MockTelephonyProvider } from "@/providers/telephony/mock/mock-telephony-provider";
import type { TelephonyProvider } from "@/providers/telephony/interface";

let cached: TelephonyProvider | null = null;

export function getTelephonyProvider() {
  if (cached) return cached;
  const name = activeTelephonyProvider();
  if (name === "livekit") {
    cached = new LiveKitTelephonyProvider();
    return cached;
  }
  if (name === "telnyx") {
    throw new Error("Telnyx does not place the call. Set TELEPHONY_PROVIDER=livekit so LiveKit opens the session and dials through the Telnyx SIP trunk.");
  }
  if (name !== "mock") {
    throw new Error(`Unknown TELEPHONY_PROVIDER "${name}". Use "mock" or "livekit".`);
  }
  cached = new MockTelephonyProvider();
  return cached;
}

export function resetTelephonyProviderForTests() {
  cached = null;
}

export function getProviderLabel(provider: string, isMock: boolean) {
  if (isMock || provider === "mock") return "MOCK PROVIDER";
  if (provider === "livekit") return "LIVEKIT";
  return provider.toUpperCase();
}
