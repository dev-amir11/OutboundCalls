import { DATE_PRESETS, LEAD_PRESETS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LeadFilterFields({
  values,
  action,
}: {
  values: Record<string, string | undefined>;
  action?: string;
}) {
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-white/10 bg-[#161b24] p-4 md:grid-cols-2 xl:grid-cols-4">
      <Field label="Search" name="q" defaultValue={values.q} placeholder="Name, phone, email, company" />
      <SelectField label="Lead status" name="preset" defaultValue={values.preset || "all"} options={LEAD_PRESETS.map((item) => ({ value: item.value, label: item.label }))} />
      <SelectField label="Date filter" name="datePreset" defaultValue={values.datePreset || ""} options={DATE_PRESETS.map((item) => ({ value: item.value, label: item.label }))} />
      <Field label="Imported from" name="importFrom" type="date" defaultValue={values.importFrom} />
      <Field label="Imported to" name="importTo" type="date" defaultValue={values.importTo} />
      <Field label="Last call from" name="callFrom" type="date" defaultValue={values.callFrom} />
      <Field label="Last call to" name="callTo" type="date" defaultValue={values.callTo} />
      <div className="flex items-end">
        <Button type="submit">Apply filters</Button>
      </div>
    </form>
  );
}

export function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <Label>{label}</Label>
      <Input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} />
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="grid gap-1.5">
      <Label>{label}</Label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-10 rounded-md border border-white/15 bg-[#0f131a] px-3 text-sm text-zinc-100 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
      >
        {options.map((option) => (
          <option key={option.value || "empty"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
