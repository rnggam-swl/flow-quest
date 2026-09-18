import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getLatestEnrollment } from "@/lib/participant";
import { ensureSoloTeam } from "@/lib/soloTeam";
import { prisma } from "@/lib/prisma";
import { ResultClient } from "./ResultClient";

export default async function ResultPage() {
  const user = await requireRole("PARTICIPANT");
  const enrollment = await getLatestEnrollment(user.id);
  if (!enrollment) redirect("/brief");

  const teamId = await ensureSoloTeam(enrollment.sessionId, user.id, user.displayName);

  const sessionQuest2 = await prisma.sessionQuest.findFirst({
    where: { sessionId: enrollment.sessionId, order: 2 },
  });
  if (!sessionQuest2) redirect("/brief");

  const submission = await prisma.flowSubmission.findUnique({
    where: { teamId_questId: { teamId, questId: sessionQuest2.questId } },
    include: { Score: true },
  });
  if (!submission || !submission.Score) redirect("/brief");

  const reflection = await prisma.reflection.findFirst({
    where: { userId: user.id, sessionId: enrollment.sessionId, question: "Kenapa kamu memilih flow ini? (Quest 2)" },
  });

  const elapsed = submission.timeSpentSeconds ?? 0;

  return (
    <ResultClient
      submissionId={submission.id}
      timeExpired={submission.status === "TIME_EXPIRED"}
      elapsedSeconds={elapsed}
      score={{
        goalScore: submission.Score.goalScore,
        flowScore: submission.Score.flowScore,
        logicScore: submission.Score.logicScore,
        edgeCaseScore: submission.Score.edgeCaseScore,
        simplicityScore: submission.Score.simplicityScore,
      }}
      existingReflection={reflection?.answer ?? ""}
    />
  );
}
