import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadParticipantPractice } from "@/lib/practice/practiceData";
import { PracticeWorkbook } from "@/components/practice/PracticeWorkbook";

export const metadata: Metadata = { title: "Modul Latihan Flow" };

export default async function LatihanPage() {
  const user = await requireRole("PARTICIPANT");
  const practice = await loadParticipantPractice(user);
  if (!practice || !practice.finished) redirect("/brief");

  return (
    <PracticeWorkbook
      plan={practice.plan}
      modules={practice.modules}
      nodes={practice.nodes}
      closing={practice.closing}
      initialCompleted={practice.completedParts}
      initialAnswers={practice.answers}
      mode="participant"
    />
  );
}
