import type { AnswerType, CallLifecycleStatus, ScheduledOutcome } from "@/services/calls/state-machine";

export type InitiateCallParams = {
  clientCallId: string;
  to: string;
  from?: string;
  forcedOutcome?: ScheduledOutcome;
  metadata?: Record<string, string>;
};

export type CallResult = {
  providerCallId: string;
  status: CallLifecycleStatus;
  scheduledOutcome?: ScheduledOutcome;
  isMock: boolean;
};

export type ProviderStatus = {
  status: CallLifecycleStatus;
  answerType?: AnswerType | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export interface TelephonyProvider {
  readonly name: string;
  initiateCall(params: InitiateCallParams): Promise<CallResult>;
  getCallStatus(callId: string): Promise<ProviderStatus>;
  hangupCall(callId: string): Promise<void>;
  playAudio(callId: string, audioUrl: string): Promise<void>;
}
