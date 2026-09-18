import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getLatestEnrollment } from "@/lib/participant";
import { ensureSoloTeam } from "@/lib/soloTeam";
import { prisma } from "@/lib/prisma";
import { GenericResultClient } from "./GenericResultClient";

const NEXT_STEP: Record<number, { href: string; label: string }> = {
  3: { href: "/quest/4", label: "Lanjut ke Quest 4 →" },
  4: { href: "/quest/5", label: "Lanjut ke Quest 5 →" },
  5: { href: "/brief", label: "← Kembali ke Session Brief" },
};

export default async function OrderedResultPage({ params }: { params: Promise<{ order: string }> }) {
  const { order: orderParam } = await params;
  const order = Number(orderParam);
  if (![3, 4, 5].includes(order)) notFound();

  const user = await requireRole("PARTICIPANT");
  const enrollment = await getLatestEnrollment(user.id);
  if (!enrollment) redirect("/brief");

  const teamId = await ensureSoloTeam(enrollment.sessionId, user.id, user.displayName);

  const sessionQuest = await prisma.sessionQuest.findFirst({
    where: { sessionId: enrollment.sessionId, order },
  });
  if (!sessionQuest) redirect("/brief");

  const submission = await prisma.flowSubmission.findUnique({
    where: { teamId_questId: { teamId, questId: sessionQuest.questId } },
    include: { Score: true },
  });
  if (!submission || !submission.Score) redirect("/brief");

  const withReflection = order === 5;
  let existingReflection = "";
  if (withReflection) {
    const reflection = await prisma.reflection.findFirst({
      where: { userId: user.id, sessionId: enrollment.sessionId, question: `Kenapa kamu memilih flow ini? (Quest ${order})` },
    });
    existingReflection = reflection?.answer ?? "";
  }

  const next = NEXT_STEP[order];

  return (
    <GenericResultClient
      submissionId={submission.id}
      questOrder={order}
      timeExpired={submission.status === "TIME_EXPIRED"}
      elapsedSeconds={submission.timeSpentSeconds ?? 0}
      score={{
        goalScore: submission.Score.goalScore,
        flowScore: submission.Score.flowScore,
        logicScore: submission.Score.logicScore,
        constraintScore: submission.Score.constraintScore,
        edgeCaseScore: submission.Score.edgeCaseScore,
        simplicityScore: submission.Score.simplicityScore,
      }}
      withReflection={withReflection}
      existingReflection={existingReflection}
      nextHref={next.href}
      nextLabel={next.label}
    />
  );
}
