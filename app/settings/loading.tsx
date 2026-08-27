export default function SettingsLoading() {
  return (
    <div aria-label="Loading settings" className="animate-pulse">
      <div className="h-3 w-20 rounded bg-navy/8" />
      <div className="mt-3 h-9 w-52 rounded-lg bg-navy/10" />
      <div className="mt-3 h-4 w-full max-w-lg rounded bg-navy/8" />
      <div className="mt-8 h-[360px] rounded-2xl border border-navy/8 bg-white" />
    </div>
  );
}
