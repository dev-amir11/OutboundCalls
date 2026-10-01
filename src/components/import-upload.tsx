"use client";

import { useActionState } from "react";
import { uploadImportAction } from "@/app/actions/imports";
import { Button } from "@/components/ui/button";

export function ImportUpload() {
  const [state, action, pending] = useActionState(uploadImportAction, null);
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-white/10 bg-[#161b24] p-5">
      <label className="grid gap-1.5 text-sm font-medium">
        Spreadsheet
        <input name="file" type="file" accept=".xlsx,.xls,.csv" required className="text-sm font-normal" />
      </label>
      <p className="text-sm text-zinc-400">Columns required: Name and Phone. Extra columns are stored with the lead. .xlsx, .xls, and .csv are accepted.</p>
      {state?.error ? <p className="rounded-md bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{state.error}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Reading file…" : "Preview import"}
        </Button>
      </div>
    </form>
  );
}
