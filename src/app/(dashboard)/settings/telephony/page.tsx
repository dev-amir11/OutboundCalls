import { saveTelephonySettingsAction } from "@/app/actions/settings";
import { MOCK_RESULT_OPTIONS } from "@/lib/constants";
import { activeTelephonyProvider, liveKitSetupItems } from "@/providers/livekit/config";
import { getGlobalForcedOutcome } from "@/repositories/settings-repository";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function TelephonySettingsPage() {
  const forced = await getGlobalForcedOutcome();
  const provider = activeTelephonyProvider();
  const setup = liveKitSetupItems();
  const ready = setup.every((item) => item.configured);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Telephony"
        description="Mock mode simulates calls. LiveKit mode opens a room for every outbound call and keeps that room as the session. Telnyx is the SIP trunk LiveKit dials through."
      />
      <section className="max-w-2xl rounded-xl border border-white/10 bg-[#161b24] p-5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Active provider</span>
          <Badge value={provider === "livekit" ? "LIVEKIT" : "MOCK"}>{provider === "livekit" ? "LIVEKIT" : "MOCK PROVIDER"}</Badge>
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          Set <code className="text-zinc-200">TELEPHONY_PROVIDER=livekit</code> after the values below are present. Leave it on <code className="text-zinc-200">mock</code> to keep simulated calls.
        </p>
        <ul className="mt-4 grid gap-2 text-sm">
          {setup.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2">
              <span>
                <span className="text-zinc-100">{item.label}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">{item.id}</span>
              </span>
              <span className={item.configured ? "text-emerald-300" : "text-amber-200"}>{item.configured ? "Set" : "Missing"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-zinc-400">
          {ready
            ? "LiveKit can open a session and dial through Telnyx. Use an existing LIVEKIT_SIP_TRUNK_ID, or set TELNYX_SIP_USERNAME and TELNYX_SIP_PASSWORD so the desk creates a trunk named outbound-calls-telnyx."
            : "Add the missing values to the environment. Secrets stay in the environment and are not stored in the database."}
          {" "}
          TELNYX_SIP_ADDRESS defaults to sip.telnyx.com. The address must be a host, without a sip: prefix.
        </p>
      </section>
      {provider === "mock" ? (
        <section className="max-w-2xl rounded-xl border border-white/10 bg-[#161b24] p-5">
          <h2 className="font-semibold">Mock result</h2>
          <p className="mt-2 text-sm text-zinc-400">
            This applies only while the mock provider is active. It does not place a telephone call.
          </p>
          <form action={saveTelephonySettingsAction} className="mt-5 grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Global mock result
              <select
                name="forcedOutcome"
                defaultValue={forced ?? "RANDOM"}
                className="h-10 rounded-md border border-white/15 bg-[#0f131a] px-3 font-normal text-zinc-100"
              >
                {MOCK_RESULT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-zinc-400">A campaign can override this. Random uses a development mix of human, voicemail, no answer, busy, and failed.</p>
            <div>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
