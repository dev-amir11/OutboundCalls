import { confirmImportAction } from "@/app/actions/imports";
import { listImports } from "@/repositories/import-repository";
import { readImportPreview } from "@/services/imports/import-service";
import { ImportUpload } from "@/components/import-upload";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const previewId = typeof params.preview === "string" ? params.preview : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;
  const preview = previewId ? await readImportPreview(previewId) : null;
  const history = await listImports();

  return (
    <div>
      <PageHeader
        title="Import leads"
        description="Upload a spreadsheet, review invalid and duplicate rows, then confirm. Importing does not start calls."
      />
      <ImportUpload />
      {error ? <p className="mt-4 rounded-md bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      {preview?.validation ? (
        <section className="mt-6 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Summary label="Total rows" value={preview.validation.summary.totalRows} />
            <Summary label="Valid" value={preview.validation.summary.valid} />
            <Summary label="Invalid" value={preview.validation.summary.invalid} />
            <Summary label="Duplicates" value={preview.validation.summary.duplicates} />
            <Summary label="Ready to import" value={preview.record.status === "PREVIEW" ? preview.validation.summary.valid : preview.record.importedRows} />
          </div>
          {preview.record.status === "PREVIEW" ? (
            <form action={confirmImportAction}>
              <input type="hidden" name="importId" value={preview.record.id} />
              <Button type="submit" disabled={preview.validation.summary.valid === 0}>
                Confirm import
              </Button>
            </form>
          ) : (
            <p className="text-sm text-zinc-400">This file was already imported ({preview.record.importedRows} leads).</p>
          )}
          <IssueTable title="Invalid rows" rows={preview.validation.invalid.map((row) => ({ ...row, detail: row.reason }))} />
          <IssueTable title="Duplicates" rows={preview.validation.duplicates.map((row) => ({ ...row, detail: row.reason }))} />
        </section>
      ) : null}
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Import history</h2>
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#161b24]">
          <table className="w-full min-w-[720px] whitespace-nowrap text-left text-sm">
            <thead className="border-b border-white/10 text-zinc-400">
              <tr>
                {["File", "Status", "Total", "Valid", "Invalid", "Duplicates", "Imported", "When"].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                    No imports yet.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3">{item.fileName}</td>
                    <td className="px-4 py-3">{item.status}</td>
                    <td className="px-4 py-3">{item.totalRows}</td>
                    <td className="px-4 py-3">{item.validRows}</td>
                    <td className="px-4 py-3">{item.invalidRows}</td>
                    <td className="px-4 py-3">{item.duplicateRows}</td>
                    <td className="px-4 py-3">{item.importedRows}</td>
                    <td className="px-4 py-3">{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#161b24] px-4 py-3">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function IssueTable({ title, rows }: { title: string; rows: { rowNumber: number; name: string; phone: string; detail: string }[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="mb-2 font-medium">{title}</h3>
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#161b24]">
        <table className="w-full min-w-[640px] whitespace-nowrap text-left text-sm">
          <thead className="border-b border-white/10 text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Row</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.rowNumber}-${row.phone}`} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3">{row.rowNumber}</td>
                <td className="px-4 py-3">{row.name || "—"}</td>
                <td className="px-4 py-3">{row.phone || "—"}</td>
                <td className="px-4 py-3">{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
