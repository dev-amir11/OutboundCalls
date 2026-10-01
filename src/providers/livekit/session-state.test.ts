import { describe, expect, it } from "vitest";
import { liveKitRoomName, liveKitSetupItems, normalizeSipAddress } from "@/providers/livekit/config";
import { mapLiveKitSession } from "@/providers/livekit/session-state";

describe("LiveKit session", () => {
  it("uses one room name for the life of a call", () => {
    expect(liveKitRoomName("abc")).toBe("oc-abc");
  });

  it("accepts a Telnyx SIP host without a sip: prefix", () => {
    expect(normalizeSipAddress("sip:sip.telnyx.com")).toBe("sip.telnyx.com");
  });

  it("treats an existing trunk id or Telnyx SIP credentials as trunk configuration", () => {
    const withTrunk = liveKitSetupItems({
      LIVEKIT_URL: "https://example.livekit.cloud",
      LIVEKIT_API_KEY: "key",
      LIVEKIT_API_SECRET: "secret",
      TELNYX_PHONE_NUMBER: "+15550001111",
      LIVEKIT_SIP_TRUNK_ID: "ST_123",
    });
    expect(withTrunk.every((item) => item.configured)).toBe(true);

    const withCredentials = liveKitSetupItems({
      LIVEKIT_URL: "https://example.livekit.cloud",
      LIVEKIT_API_KEY: "key",
      LIVEKIT_API_SECRET: "secret",
      TELNYX_PHONE_NUMBER: "+15550001111",
      TELNYX_SIP_USERNAME: "user",
      TELNYX_SIP_PASSWORD: "pass",
    });
    expect(withCredentials.every((item) => item.configured)).toBe(true);
  });

  it("keeps an answered call inside the LiveKit room until the room closes", () => {
    expect(mapLiveKitSession({ roomExists: true, sipCallStatus: "active", previouslyAnswered: false })).toMatchObject({
      status: "ANSWERED_HUMAN",
      terminal: false,
    });
    expect(mapLiveKitSession({ roomExists: false, sipCallStatus: null, previouslyAnswered: true })).toMatchObject({
      status: "COMPLETED",
      outcome: "SUCCESSFUL",
      terminal: true,
    });
    expect(mapLiveKitSession({ roomExists: false, sipCallStatus: null, previouslyAnswered: false })).toMatchObject({
      status: "NO_ANSWER",
      terminal: true,
    });
  });
});
