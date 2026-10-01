import type { CallResult, InitiateCallParams, ProviderStatus, TelephonyProvider } from "@/providers/telephony/interface";

type TelnyxConfig = {
  apiKey?: string;
  connectionId?: string;
  fromNumber?: string;
};

/**
 * Not used to place calls. Outbound dialing goes through LiveKit, and Telnyx is the SIP trunk
 * configured with TELNYX_SIP_USERNAME, TELNYX_SIP_PASSWORD, and TELNYX_PHONE_NUMBER.
 */
export class TelnyxProvider implements TelephonyProvider {
  readonly name = "telnyx";

  constructor(private readonly config: TelnyxConfig) {}

  private assertConfigured() {
    if (!this.config.apiKey || !this.config.connectionId || !this.config.fromNumber) {
      throw new Error(
        "Telnyx is not configured. Set TELNYX_API_KEY, TELNYX_CONNECTION_ID, and TELNYX_PHONE_NUMBER, or use TELEPHONY_PROVIDER=mock.",
      );
    }
  }

  async initiateCall(params: InitiateCallParams): Promise<CallResult> {
    this.assertConfigured();
    void params;
    throw new Error("TelnyxProvider.initiateCall is not implemented. Wire the carrier API here when credentials are available.");
  }

  async getCallStatus(callId: string): Promise<ProviderStatus> {
    this.assertConfigured();
    void callId;
    throw new Error("TelnyxProvider.getCallStatus is not implemented.");
  }

  async hangupCall(callId: string) {
    this.assertConfigured();
    void callId;
    throw new Error("TelnyxProvider.hangupCall is not implemented.");
  }

  async playAudio(callId: string, audioUrl: string) {
    this.assertConfigured();
    void callId;
    void audioUrl;
    throw new Error("TelnyxProvider.playAudio is not implemented.");
  }
}
