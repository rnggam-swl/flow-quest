import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPlanEditor } from "@/lib/practice/planAdmin";
import { PlanEditor } from "@/components/builder/PlanEditor";

export const metadata: Metadata = { title: "Rencana Latihan" };

export default async function PlanEditorPage({ params }: { params: Promise<{ sessionParticipantId: string }> }) {
  const data = await loadPlanEditor((await params).sessionParticipantId);
  if (!data) notFound();
  // Restart the editor from the server's copy after a save elsewhere or a delete.
  return <PlanEditor key={data.revision} data={data} />;
}
