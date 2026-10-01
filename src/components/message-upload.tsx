"use client";

import { useActionState } from "react";
import { uploadMessageAction } from "@/app/actions/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MessageUpload({ kind }: { kind: "HUMAN_ANSWER" | "VOICEMAIL" }) {
  const [state, action, pending] = useActionState(uploadMessageAction, null);
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-white/10 bg-[#161b24] p-5">
      <input type="hidden" name="kind" value={kind} />
      <label className="grid gap-1.5">
        <Label>Message name</Label>
        <Input name="name" required minLength={2} placeholder="September greeting" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Audio file
        <input name="file" type="file" accept=".mp3,.wav,.m4a,audio/*" required className="font-normal" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="makeActive" /> Make this the active message
      </label>
      {state?.error ? <p className="rounded-md bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{state.error}</p> : null}
      {state?.ok ? <p className="rounded-md bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">Message saved.</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </form>
  );
}
