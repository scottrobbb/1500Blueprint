import { PageHeader } from "@/components/ultimate/PageHeader";

export const metadata = { title: "Live Calls" };

export default function UltimateLiveCallsPage() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-7 sm:px-7 sm:py-10">
      <PageHeader
        eyebrow="Connect"
        title="Live Calls"
        description="Scott's live-call schedule and recordings will live here."
      />
      <section className="mt-7 min-h-64 rounded-[18px] border border-dashed border-navy/15 bg-white" />
    </div>
  );
}
