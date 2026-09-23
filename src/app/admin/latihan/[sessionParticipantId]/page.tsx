import Link from "next/link";
import { notFound } from "next/navigation";
import { getManagedSession } from "@/lib/managedSession";
import { prisma } from "@/lib/prisma";
import { answeredQuestion, planParts, resolvePlan } from "@/lib/practice/plan";
import { readAnswers } from "@/lib/practice/practiceData";
import { PracticeWorkbook } from "@/components/practice/PracticeWorkbook";
import { Eyebrow, Headline } from "@/components/ui";

export default async function AdminParticipantPracticePage({
  params,
}: {
  params: Promise<{ sessionParticipantId: string }>;
}) {
  const { sessionParticipantId } = await params;
  const session = await getManagedSession();
  if (!session) notFound();

  const enrollment = await prisma.sessionParticipant.findFirst({
    where: { id: sessionParticipantId, sessionId: session.id },
    include: { User: true, PracticePlan: true },
  });
  if (!enrollment) notFound();

  const row = enrollment.PracticePlan;
  const plan = resolvePlan(row?.content, enrollment.User.displayName);
  const parts = planParts(plan.content);
  const completed = row?.completedParts ?? [];
  const answers = readAnswers(row?.answers);
  const answerEntries = Object.entries(answers);

  return (
    <>
      <div className="mx-auto max-w-[1080px] px-6 pt-4 pb-6">
        <Link href="/admin/latihan" className="mb-3 inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-text">
          ← Kembali ke Modul Latihan
        </Link>
        <Eyebrow>Pratinjau Halaman Peserta</Eyebrow>
        <Headline className="text-[26px]">{enrollment.User.displayName}</Headline>
        <p className="mb-4 text-[13.5px] text-muted">
          {plan.personal ? "Rencana personal" : "Belum ada rencana personal (keenam modul)"} ·{" "}
          {parts.filter((p) => completed.includes(p)).length} dari {parts.length} bagian selesai ·{" "}
          <Link href={`/admin/participant/${enrollment.id}`} className="text-teal underline">
            Laporan quest →
          </Link>
        </p>

        {answerEntries.length > 0 && (
          <div className="mb-4 rounded-[14px] border border-border bg-surface p-5">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[1px] text-teal">Jawaban Tertulis</div>
            <div className="flex flex-col gap-3.5">
              {answerEntries.map(([key, text]) => (
                <div key={key}>
                  <div className="mb-1 text-[13px] font-semibold">{answeredQuestion(plan.content, key)}</div>
                  <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6] text-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[12.5px] text-muted2">
          Di bawah ini tampilan yang dilihat peserta, termasuk bagian yang sudah ia selesaikan. Kamu bisa mencoba semua
          interaksinya; tidak ada yang tersimpan atau mengubah progres peserta.
        </p>
      </div>
      <PracticeWorkbook plan={plan} initialCompleted={completed} initialAnswers={answers} mode="preview" />
    </>
  );
}
