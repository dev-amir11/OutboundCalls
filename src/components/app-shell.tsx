"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  History,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Phone,
  PhoneCall,
  Radio,
  Plus,
  Settings,
  Upload,
  Users,
  Voicemail,
  X,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth-token";

const groups = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Leads",
    items: [
      { href: "/leads", label: "All Leads", icon: Users },
      { href: "/leads/import", label: "Import Leads", icon: Upload },
    ],
  },
  {
    label: "Campaigns",
    items: [
      { href: "/campaigns", label: "All Campaigns", icon: Megaphone },
      { href: "/campaigns/new", label: "Create Campaign", icon: Plus },
    ],
  },
  {
    label: "Calls",
    items: [
      { href: "/calls", label: "Current Calls", icon: PhoneCall },
      { href: "/calls/place", label: "Place a Call", icon: Phone },
      { href: "/calls/livekit", label: "LiveKit Sessions", icon: Radio },
      { href: "/calls/history", label: "Call History", icon: History },
    ],
  },
  {
    label: "Voicemail",
    items: [
      { href: "/messages/human", label: "Human Answer Messages", icon: AudioLines },
      { href: "/messages/voicemail", label: "Voicemail Messages", icon: Voicemail },
    ],
  },
  {
    label: "Settings",
    items: [{ href: "/settings/telephony", label: "Telephony", icon: Settings }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/leads") return pathname === "/leads" || /^\/leads\/(?!import$).+/.test(pathname);
  if (href === "/campaigns") return pathname === "/campaigns" || /^\/campaigns\/(?!new$).+/.test(pathname);
  if (href === "/calls") return pathname === "/calls";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ user, provider = "mock", children }: { user: SessionUser; provider?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(false);
  const open = openPath === pathname;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPath(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-[#0b0e13] text-zinc-100">
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpenPath(null)}
        />
      ) : null}
      <aside
        id="app-sidebar"
        inert={!desktop && !open ? true : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-white/10 bg-[#10141b] transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-300/80">Calling desk</p>
            <p className="mt-1 text-lg font-semibold">Outbound Calls</p>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-zinc-400 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close menu"
            onClick={() => setOpenPath(null)}
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{group.label}</p>
              <div className="mt-1 space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/10 hover:text-white",
                        active && "bg-teal-400/15 font-medium text-teal-100",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-teal-300" : "text-zinc-500")} />
                      <span className="min-w-0 leading-snug">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <p className="truncate px-2 text-sm text-zinc-300">{user.name}</p>
          <p className="truncate px-2 text-xs text-zinc-500">{user.email}</p>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
              Log out
            </button>
          </form>
        </div>
      </aside>
      <div className="lg:pl-72">
        <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0e13]/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 lg:hidden">
            <button
              type="button"
              className="rounded-md border border-white/10 p-2 text-zinc-200 hover:bg-white/10"
              aria-expanded={open}
              aria-controls="app-sidebar"
              onClick={() => setOpenPath(pathname)}
            >
              <Menu className="size-5" />
              <span className="sr-only">Open menu</span>
            </button>
            <p className="text-sm font-semibold">Outbound Calls</p>
          </div>
          {provider === "livekit" ? (
            <div className="border-t border-sky-400/20 bg-sky-400/10 px-4 py-2 text-sm text-sky-100 lg:border-t-0 lg:px-8">
              <strong>LIVEKIT.</strong> Each outbound call is created in a LiveKit room, and that room is the session until the call ends. Telnyx is the SIP trunk LiveKit dials through.
            </div>
          ) : (
            <div className="border-t border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 lg:border-t-0 lg:px-8">
              <strong>MOCK PROVIDER.</strong> Calls on this screen are simulated. Nothing is placed on the telephone network.
            </div>
          )}
        </div>
        <main className="px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
