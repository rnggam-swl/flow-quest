import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLatestEnrollment } from "@/lib/participant";
import { getOwnedSubmission } from "@/lib/ownership";
import { logActivity } from "@/lib/activity";
import { computeRationaleScore } from "@/lib/flowScoring";

const bodySchema = z.object({ answer: z.string(), submissionId: z.string().uuid() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const enrollment = await getLatestEnrollment(user.id);
  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 400 });

  const submission = await getOwnedSubmission(user.id, parsed.data.submissionId);
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const quest = await prisma.quest.findUniqueOrThrow({ where: { id: submission.questId } });
  const teamId = submission.teamId;
  // Disambiguates reflections across quests (Reflection has no submissionId column).
  const question = `Kenapa kamu memilih flow ini? (Quest ${quest.order})`;

  const existing = await prisma.reflection.findFirst({
    where: { userId: user.id, sessionId: enrollment.sessionId, question },
  });

  const reflection = existing
    ? await prisma.reflection.update({ where: { id: existing.id }, data: { answer: parsed.data.answer } })
    : await prisma.reflection.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          teamId,
          sessionId: enrollment.sessionId,
          question,
          answer: parsed.data.answer,
          source: "INDIVIDUAL",
        },
      });

  void logActivity({
    event: "REFLECTION_SUBMITTED",
    userId: user.id,
    teamId,
    sessionId: enrollment.sessionId,
    metadata: { reflectionId: reflection.id, questOrder: quest.order, length: parsed.data.answer.trim().length },
    broadcastExtra: { displayName: user.displayName },
  });

  // Fold the rationale score into this specific submission's Score.
  const rationaleScore = computeRationaleScore(parsed.data.answer);
  const score = await prisma.score.findUnique({ where: { submissionId: submission.id } });
  if (score) {
    const base = score.goalScore + score.flowScore + score.logicScore + score.constraintScore + score.edgeCaseScore + score.simplicityScore;
    await prisma.score.update({
      where: { submissionId: submission.id },
      data: { rationaleScore, totalScore: base + rationaleScore, updatedAt: new Date() },
    });
  }

  return NextResponse.json({ reflection });
}
