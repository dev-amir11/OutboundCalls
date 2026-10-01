import type { CallResult, InitiateCallParams, ProviderStatus, TelephonyProvider } from "@/providers/telephony/interface";
import { randomOutcome } from "@/services/calls/queue";
import type { CallLifecycleStatus } from "@/services/calls/state-machine";

type MemoryCall = {
  status: CallLifecycleStatus;
  lastAudioUrl?: string;
};

const memory = new Map<string, MemoryCall>();

export class MockTelephonyProvider implements TelephonyProvider {
  readonly name = "mock";

  async initiateCall(params: InitiateCallParams): Promise<CallResult> {
    const providerCallId = `mock_${params.clientCallId}`;
    const scheduledOutcome = params.forcedOutcome ?? randomOutcome();
    memory.set(providerCallId, { status: "QUEUED" });
    return {
      providerCallId,
      status: "QUEUED",
      scheduledOutcome,
      isMock: true,
    };
  }

  async getCallStatus(callId: string): Promise<ProviderStatus> {
    const call = memory.get(callId);
    if (!call) {
      return {
        status: "FAILED",
        errorCode: "MOCK_NOT_FOUND",
        errorMessage: "This simulated call is not in the current process memory. The database timeline is the source of truth.",
      };
    }
    return { status: call.status };
  }

  async hangupCall(callId: string) {
    const call = memory.get(callId);
    if (call) call.status = "CANCELLED";
  }

  async playAudio(callId: string, audioUrl: string) {
    const call = memory.get(callId);
    if (call) call.lastAudioUrl = audioUrl;
  }

  remember(callId: string, status: CallLifecycleStatus) {
    const call = memory.get(callId) ?? { status };
    call.status = status;
    memory.set(callId, call);
  }
}
