import { ParticipantInfo_Kind, SIPTransport } from "@livekit/protocol";
import { RoomServiceClient, ServerError, SipClient } from "livekit-server-sdk";
import { liveKitRoomName, outboundTrunkName, readLiveKitTrunkConfig, type LiveKitTrunkConfig } from "@/providers/livekit/config";
import { mapLiveKitSession, type LiveKitSessionSnapshot } from "@/providers/livekit/session-state";
import type { CallResult, InitiateCallParams, ProviderStatus, TelephonyProvider } from "@/providers/telephony/interface";

export class LiveKitTelephonyProvider implements TelephonyProvider {
  readonly name = "livekit";
  private resolvedTrunkId: string | null = null;

  async initiateCall(params: InitiateCallParams): Promise<CallResult> {
    const config = readLiveKitTrunkConfig();
    const roomName = liveKitRoomName(params.clientCallId);
    const { rooms, sip } = clients(config);
    await rooms.createRoom({
      name: roomName,
      emptyTimeout: 5 * 60,
      departureTimeout: 30,
      metadata: JSON.stringify({
        callId: params.clientCallId,
        to: params.to,
        session: "livekit",
      }),
    });

    try {
      const trunkId = await this.trunkId(sip, config);
      await sip.createSipParticipant(trunkId, params.to, roomName, {
        fromNumber: config.fromNumber,
        participantIdentity: `phone-${params.clientCallId}`,
        participantName: params.to,
        participantMetadata: JSON.stringify(params.metadata ?? {}),
        playDialtone: false,
        ringingTimeout: 45,
        maxCallDuration: 30 * 60,
        waitUntilAnswered: false,
      });
    } catch (error) {
      await rooms.deleteRoom(roomName).catch(() => undefined);
      throw error;
    }

    return {
      providerCallId: roomName,
      status: "DIALING",
      isMock: false,
    };
  }

  async readSession(roomName: string, previouslyAnswered: boolean): Promise<LiveKitSessionSnapshot> {
    const config = readLiveKitTrunkConfig();
    const { rooms } = clients(config);
    try {
      const participants = await rooms.listParticipants(roomName);
      const phone =
        participants.find((participant) => participant.kind === ParticipantInfo_Kind.SIP) ??
        participants.find((participant) => participant.identity.startsWith("phone-"));
      return mapLiveKitSession({
        roomExists: true,
        sipCallStatus: phone?.attributes?.["sip.callStatus"] ?? null,
        previouslyAnswered,
      });
    } catch (error) {
      if (!isMissingRoom(error)) throw error;
      return mapLiveKitSession({ roomExists: false, sipCallStatus: null, previouslyAnswered });
    }
  }

  async getCallStatus(callId: string): Promise<ProviderStatus> {
    const snapshot = await this.readSession(callId, false);
    return {
      status: snapshot.status,
      answerType: snapshot.answerType,
      errorCode: snapshot.status === "FAILED" ? "LIVEKIT_SESSION" : null,
      errorMessage: snapshot.status === "FAILED" ? snapshot.message : null,
    };
  }

  async hangupCall(callId: string) {
    const config = readLiveKitTrunkConfig();
    const { rooms } = clients(config);
    await rooms.deleteRoom(callId).catch((error: unknown) => {
      if (!isMissingRoom(error)) throw error;
    });
  }

  async playAudio() {
    throw new Error("LiveKit keeps this call in its room. Audio is handled by participants in that session, not by a separate file playback request.");
  }

  private async trunkId(sip: SipClient, config: LiveKitTrunkConfig) {
    if (config.trunkId) return config.trunkId;
    if (this.resolvedTrunkId) return this.resolvedTrunkId;
    const trunks = await sip.listSipOutboundTrunk();
    const existing = trunks.find((trunk) => trunk.name === outboundTrunkName() && trunk.numbers.includes(config.fromNumber));
    if (existing?.sipTrunkId) {
      this.resolvedTrunkId = existing.sipTrunkId;
      return existing.sipTrunkId;
    }
    const created = await sip.createSipOutboundTrunk(outboundTrunkName(), config.sipAddress, [config.fromNumber], {
      transport: SIPTransport.SIP_TRANSPORT_AUTO,
      authUsername: config.sipUsername,
      authPassword: config.sipPassword,
      metadata: "Created by the outbound calling desk for the Telnyx SIP trunk.",
    });
    this.resolvedTrunkId = created.sipTrunkId;
    return created.sipTrunkId;
  }
}

function clients(config: LiveKitTrunkConfig) {
  return {
    rooms: new RoomServiceClient(config.url, config.apiKey, config.apiSecret),
    sip: new SipClient(config.url, config.apiKey, config.apiSecret),
  };
}

function isMissingRoom(error: unknown) {
  if (error instanceof ServerError && (error.status === 404 || error.code === "not_found")) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("not found") || message.includes("does not exist");
}
