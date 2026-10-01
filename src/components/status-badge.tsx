import { cn } from "@/lib/utils";
import { labelize } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-zinc-500">—</span>;
  return (
    <Badge value={value} className={cn("uppercase tracking-wide")}>
      {labelize(value)}
    </Badge>
  );
}
