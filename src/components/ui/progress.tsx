export function Progress({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-teal-400" style={{ width: `${width}%` }} />
    </div>
  );
}
