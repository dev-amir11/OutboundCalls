export type LiveKitAttachResult = {
  attached: boolean;
  reason: string;
};

export interface LiveKitCallController {
  attachAgent(params: { callId: string; providerCallId: string | null }): Promise<LiveKitAttachResult>;
}

/**
 * The calling queue asks this controller to join every answered call, including voicemail.
 * This implementation stays in that loop and declines the attach until LiveKit is configured.
 */
export class UnconfiguredLiveKitCallController implements LiveKitCallController {
  async attachAgent() {
    return {
      attached: false,
      reason: "LiveKit is not configured.",
    };
  }
}

export function getLiveKitCallController(): LiveKitCallController {
  return new UnconfiguredLiveKitCallController();
}
