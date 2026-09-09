import { notFound, redirect } from "next/navigation";
import { getSessionForDenseReading } from "@/lib/dense-reading/access";
import {
  listReadingHistory,
  loadReadingRow,
  readingSession,
  ReadingSessionError,
} from "@/lib/dense-reading/server";
import { DenseReadingRunner } from "@/components/drills/dense-reading/DenseReadingRunner";

export const metadata = { title: "Dense Reading | 1500 Blueprint" };
export default async function ReadingRoundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionForDenseReading();
  if (!session) redirect("/ultimate/drills");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row, history] = await Promise.all([
    loadReadingRow(session.email, id).catch((error: unknown) => {
      if (error instanceof ReadingSessionError && error.status === 404)
        notFound();
      throw error;
    }),
    listReadingHistory(session.email),
  ]);
  return (
    <DenseReadingRunner
      key={id}
      initialSession={await readingSession(row)}
      history={history}
    />
  );
}
