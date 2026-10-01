"use client";

import { useState } from "react";

export function ConfirmForm({
  action,
  label,
  title,
  message,
  hidden,
  variant = "default",
}: {
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  title: string;
  message: string;
  hidden?: Record<string, string>;
  variant?: "default" | "danger";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-md px-3 py-2 text-sm font-medium ${variant === "danger" ? "bg-rose-700 text-white hover:bg-rose-600" : "bg-teal-600 text-zinc-950 hover:bg-teal-500"}`}
      >
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl bg-[#161b24] p-6 shadow-xl" role="dialog" aria-modal="true">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-zinc-400">{message}</p>
            <form action={action} className="mt-5 flex justify-end gap-2">
              {hidden
                ? Object.entries(hidden).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)
                : null}
              <button type="button" className="rounded-md border border-white/15 px-3 py-2 text-sm" onClick={() => setOpen(false)}>
                Back
              </button>
              <button type="submit" className={`rounded-md px-3 py-2 text-sm ${variant === "danger" ? "bg-rose-700 text-white" : "bg-teal-600 text-zinc-950"}`}>
                Confirm
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
