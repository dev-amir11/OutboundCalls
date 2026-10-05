import "dotenv/config";
import {
  type JobContext,
  ServerOptions,
  cli,
  defineAgent,
  log,
  voice,
} from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as google from "@livekit/agents-plugin-google";
import { fileURLToPath } from "node:url";
import {
  AMD_CLASSIFIER_PROMPT,
  PLACE_CALL_AMD_AGENT,
  looksLikeVoicemailEarly,
  refineAmdCategory,
  type AmdDataMessage,
  type SttLogMessage,
} from "../providers/livekit/amd";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env and restart npm run agent.`);
  }
  return value;
}

class DeskAmdAgent extends voice.Agent {
  constructor() {
    super({
      instructions:
        "You classify whether a person or a machine answered an outbound phone call. " +
        "Do not speak to the callee. The desk operator handles talking and voicemail playback.",
    });
  }
}

type JobMeta = {
  participantIdentity?: string;
  sessionId?: string;
};

function readMeta(raw: string | undefined): JobMeta {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as JobMeta;
  } catch {
    return {};
  }
}

async function publishJson(ctx: JobContext, message: AmdDataMessage | SttLogMessage) {
  const participant = ctx.agent;
  if (!participant) {
    log().warn("Data ready but agent is not connected to the room.");
    return;
  }
  const payload = new TextEncoder().encode(JSON.stringify(message));
  await participant.publishData(payload, { reliable: true });
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const logger = log().child({ room: ctx.room.name, agent: PLACE_CALL_AMD_AGENT });
    const meta = readMeta(ctx.job.metadata);
    const participantIdentity =
      meta.participantIdentity ||
      [...ctx.room.remoteParticipants.values()].find((p) => p.identity.startsWith("phone-"))?.identity;

    await ctx.connect();

    // Self-hosted LiveKit: use Deepgram STT + Gemini LLM (not LiveKit Cloud Inference).
    const deepgramKey = requireEnv("DEEPGRAM_API_KEY");
    const googleKey = requireEnv("GOOGLE_API_KEY");

    const session = new voice.AgentSession({
      stt: new deepgram.STT({
        apiKey: deepgramKey,
        model: "nova-3",
        language: "en",
        interimResults: true,
        punctuate: true,
      }),
      llm: new google.LLM({
        apiKey: googleKey,
        model: "gemini-2.0-flash-001",
      }),
      preemptiveGeneration: false,
    });

    await session.start({
      agent: new DeskAmdAgent(),
      room: ctx.room,
    });

    if (participantIdentity && session._roomIO) {
      session._roomIO.setParticipant(participantIdentity);
    }

    // Stream STT to the desk live log while AMD listens.
    // Strong voicemail phrases settle immediately — don't wait ~10–15s for silence/LLM.
    let earlyAmd: AmdDataMessage | null = null;
    let resolveEarly: ((message: AmdDataMessage) => void) | null = null;
    const earlyPromise = new Promise<AmdDataMessage>((resolve) => {
      resolveEarly = resolve;
    });

    const maybeSettleEarly = (text: string) => {
      if (earlyAmd || !looksLikeVoicemailEarly(text)) return;
      earlyAmd = {
        type: "amd",
        category: "machine-vm",
        rawCategory: "uncertain",
        transcript: text,
        reason: "stt_voicemail_early",
      };
      logger.info({ amd: earlyAmd }, "AMD early settle from STT phrase");
      resolveEarly?.(earlyAmd);
    };

    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
      const text = event.transcript?.trim();
      if (!text) return;
      void publishJson(ctx, {
        type: "stt",
        transcript: text,
        isFinal: event.isFinal,
      });
      logger.info({ transcript: text, isFinal: event.isFinal }, "STT");
      maybeSettleEarly(text);
    });

    const detector = new voice.AMD(session, {
      participantIdentity,
      // Force session plugins — do not auto-select LiveKit Cloud Inference.
      stt: null,
      llm: null,
      interruptOnMachine: true,
      humanSpeechThresholdMs: 400,
      humanSilenceThresholdMs: 700,
      machineSilenceThresholdMs: 900,
      // Hard cap after speech — do not wait out long carrier greetings.
      waitUntilFinished: false,
      detectionTimeoutMs: 6_000,
      maxEndpointingDelayMs: 1_200,
      prompt: AMD_CLASSIFIER_PROMPT,
    });

    try {
      if (participantIdentity) {
        try {
          await ctx.waitForParticipant(participantIdentity);
        } catch (error) {
          logger.info({ error }, "SIP participant never joined; ending AMD job.");
          await publishJson(ctx, {
            type: "amd",
            category: "uncertain",
            reason: "participant_missing",
          });
          ctx.shutdown("participant missing");
          return;
        }
      }

      logger.info({ participantIdentity }, "Running LiveKit AMD");
      const detectorPromise = detector.execute().then((result) => {
        const rawCategory = result.category as AmdDataMessage["category"];
        const refined = refineAmdCategory(rawCategory, result.transcript);
        return {
          type: "amd" as const,
          category: refined.category,
          rawCategory,
          transcript: result.transcript,
          reason: refined.reason ?? result.reason,
        } satisfies AmdDataMessage;
      });

      const message = await Promise.race([earlyPromise, detectorPromise]);
      if (message.transcript?.trim()) {
        await publishJson(ctx, {
          type: "stt",
          transcript: message.transcript.trim(),
          isFinal: true,
        });
      }
      logger.info({ amd: message }, "AMD classification complete");
      await publishJson(ctx, message);
    } catch (error) {
      logger.warn({ error }, "AMD failed; treating as uncertain so the desk can talk.");
      await publishJson(ctx, {
        type: "amd",
        category: "uncertain",
        reason: error instanceof Error ? error.message : "amd_failed",
      });
    } finally {
      await detector.aclose().catch(() => undefined);
      ctx.shutdown("amd complete");
    }
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: PLACE_CALL_AMD_AGENT,
    // Dev defaults to 0 idle procs + 10s init — Windows + tsx + Deepgram/Gemini
    // imports often exceed that and fail with "runner initialization timed out".
    numIdleProcesses: 1,
    initializeProcessTimeout: 90_000,
  }),
);
