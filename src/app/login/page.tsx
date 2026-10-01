import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0b0e13] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161b24] p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">Outbound Calls</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-50">Admin sign in</h1>
        <p className="mt-2 text-sm text-zinc-400">
          This desk runs on the mock telephony provider. Signing in does not connect a carrier.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
