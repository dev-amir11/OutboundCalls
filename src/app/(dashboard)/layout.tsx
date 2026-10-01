import { requireUser } from "@/lib/auth";
import { activeTelephonyProvider } from "@/providers/livekit/config";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user} provider={activeTelephonyProvider()}>{children}</AppShell>;
}
