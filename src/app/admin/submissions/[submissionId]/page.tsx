import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRubricMax } from "@/lib/flowScoring";
import { FlowGraphView } from "@/components/FlowGraphView";
import { Eyebrow, Headline } from "@/components/ui";

export default async function SubmissionViewerPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;

  const submission = await prisma.flowSubmission.findUnique({
    where: { id: submissionId },
    include: {
      Team: { include: { TeamMember: { include: { User: true } } } },
      FlowNode: true,
      FlowConnection: true,
      Score: true,
      Quest: true,
    },
  });
  if (!submission) notFound();

  const participant = submission.Team.TeamMember[0]?.User;
  const reflection = participant
    ? await prisma.reflection.findFirst({
        where: {
          teamId: submission.teamId,
          userId: participant.id,
          question: `Kenapa kamu memilih flow ini? (Quest ${submission.Quest.order})`,
        },
      })
    : null;

  const score = submission.Score;
  const max = getRubricMax(submission.Quest.order);
  const withReflection = submission.Quest.order === 2 || submission.Quest.order === 5;
  const displayMax = max.goal + max.flow + max.logic + max.constraint + max.edgeCase + max.simplicity + (withReflection ? 10 : 0);

  const rows: [string, string][] = score
    ? [
        ["Goal Understanding", `${score.goalScore} / ${max.goal}`],
        ["Flow Validity", `${score.flowScore} / ${max.flow}`],
        ["Logic", `${score.logicScore} / ${max.logic}`],
        ...(max.constraint > 0 ? ([["Constraint Handling", `${score.constraintScore} / ${max.constraint}`]] as [string, string][]) : []),
        ["Edge Case", `${score.edgeCaseScore} / ${max.edgeCase}`],
        ["Simplicity", `${score.simplicityScore} / ${max.simplicity}`],
        ...(withReflection ? ([["Rationale", `${score.rationaleScore} / 10`]] as [string, string][]) : []),
        ["Total", `${score.totalScore} / ${displayMax}`],
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-4 pb-20">
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-text">
        ← Kembali ke Dashboard
      </Link>
      <Eyebrow>Submission Detail · {submission.Quest.title}</Eyebrow>
      <Headline className="text-[26px]">{participant?.displayName ?? "Peserta"}</Headline>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="relative min-h-[280px] rounded-[14px] border border-border bg-surface p-5">
          <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-[1px] text-muted2">
            Flow yang Disusun
          </div>
          <FlowGraphView
            nodes={submission.FlowNode}
            connections={submission.FlowConnection}
            nativeViewMode={participant?.flowViewMode ?? "HORIZONTAL"}
            idPrefix="submission"
            maxHeight={620}
          />
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="rounded-[14px] border border-border bg-surface p-5">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[1px] text-muted2">
              Kenapa flow ini?
            </div>
            <p className="text-[14px] leading-[1.6] text-text italic">
              {reflection ? `"${reflection.answer}"` : "— belum diisi —"}
            </p>
          </div>
          <div className="rounded-[14px] border border-border bg-surface p-5">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[1px] text-muted2">
              Rincian Skor
            </div>
            {rows.map(([label, value], i) => (
              <div
                key={label}
                className={`flex justify-between py-[7px] text-[13.5px] ${
                  i < rows.length - 1 ? "border-b border-border" : "pt-2.5 font-bold"
                }`}
              >
                <span>{label}</span>
                <span className="tabular-nums text-muted">{value}</span>
              </div>
            ))}
            {rows.length === 0 && <p className="text-muted2">Belum dinilai.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
