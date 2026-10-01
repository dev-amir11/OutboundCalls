import Link from "next/link";
import { pageCount } from "@/lib/format";

export function Pagination({
  page,
  total,
  pageSize,
  basePath,
  params,
}: {
  page: number;
  total: number;
  pageSize: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = pageCount(total, pageSize);
  const href = (next: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    search.set("page", String(next));
    return `${basePath}?${search.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
      <p>
        {`${total} result${total === 1 ? "" : "s"}`}
      </p>
      <div className="flex items-center gap-2">
        <Link className={`rounded-md border border-white/15 px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-white/10"}`} href={href(page - 1)}>
          Previous
        </Link>
        <span>
          {page} / {pages}
        </span>
        <Link className={`rounded-md border border-white/15 px-3 py-1.5 ${page >= pages ? "pointer-events-none opacity-40" : "hover:bg-white/10"}`} href={href(page + 1)}>
          Next
        </Link>
      </div>
    </div>
  );
}
