import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-white/15 bg-[#0f131a] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20",
        className,
      )}
      {...props}
    />
  );
}
