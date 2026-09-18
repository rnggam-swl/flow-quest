import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth";
import { getLatestEnrollment, getQuestList } from "@/lib/participant";
import { ensureSoloTeam } from "@/lib/soloTeam";
import { canParticipantPlay } from "@/lib/sessionAccess";
import {
  runFlowValidation,
  runQuest3Validation,
  runQuest4Validation,
  computeRationaleScore,
  type FlowValidationResult,
} from "@/lib/flowScoring";

const LAST_QUEST_ORDER = 5;

function validatorFor(order: number) {
  if (order === 3) return runQuest3Validation;
  if (order === 4) return runQuest4Validation;
  return runFlowValidation; // Quest 2 and Quest 5 share the same rubric engine.
}

export async function getOrStartSubmission(teamId: string, questId: string) {
  const existing = await prisma.flowSubmission.findUnique({
    where: { teamId_questId: { teamId, questId } },
  });
  if (existing) return existing;

  return prisma.flowSubmission.create({
    data: {
      id: crypto.randomUUID(),
      teamId,
      questId,
      status: "DRAFT",
    },
  });
}

export function remainingSeconds(startedAt: Date, timeLimitMinutes: number) {
  const elapsedMs = Date.now() - startedAt.getTime();
  const totalMs = timeLimitMinutes * 60 * 1000;
  return Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000));
}

/**
 * Scores the submission's current nodes/connections, persists Score, marks
 * the FlowSubmission SUBMITTED/TIME_EXPIRED, and awards quest XP exactly once
 * (only on the DRAFT -> non-DRAFT transition).
 */
export async function finalizeSubmission(params: {
  submissionId: string;
  teamId: string;
  questId: string;
  userId: string;
  sessionId: string;
  timeExpired: boolean;
}) {
  const submission = await prisma.flowSubmission.findUniqueOrThrow({
    where: { id: params.submissionId },
    include: { FlowNode: true, FlowConnection: true, Quest: true },
  });

  const validate = validatorFor(submission.Quest.order);
  const validation: FlowValidationResult = validate(
    submission.FlowNode.map((n) => ({ id: n.id, label: n.label })),
    submission.FlowConnection.map((c) => ({
      sourceNodeId: c.sourceNodeId,
      targetNodeId: c.targetNodeId,
      connectionType: c.connectionType,
    }))
  );

  const wasAlreadyFinal = submission.status !== "DRAFT";
  const timeSpentSeconds = Math.round((Date.now() - submission.startedAt.getTime()) / 1000);

  const updatedSubmission = await prisma.flowSubmission.update({
    where: { id: submission.id },
    data: {
      status: params.timeExpired ? "TIME_EXPIRED" : "SUBMITTED",
      submittedAt: new Date(),
      timeSpentSeconds,
    },
  });

  await prisma.score.upsert({
    where: { submissionId: submission.id },
    update: {
      goalScore: validation.goalScore,
      flowScore: validation.flowScore,
      logicScore: validation.logicScore,
      constraintScore: validation.constraintScore,
      edgeCaseScore: validation.edgeCaseScore,
      simplicityScore: validation.simplicityScore,
      totalScore: validation.totalScore,
      updatedAt: new Date(),
    },
    create: {
      id: crypto.randomUUID(),
      submissionId: submission.id,
      goalScore: validation.goalScore,
      flowScore: validation.flowScore,
      logicScore: validation.logicScore,
      constraintScore: validation.constraintScore,
      edgeCaseScore: validation.edgeCaseScore,
      simplicityScore: validation.simplicityScore,
      totalScore: validation.totalScore,
      updatedAt: new Date(),
    },
  });

  if (!wasAlreadyFinal) {
    const isLastQuest = submission.Quest.order >= LAST_QUEST_ORDER;
    await prisma.sessionParticipant.updateMany({
      where: { sessionId: params.sessionId, participantId: params.userId },
      data: {
        totalXp: { increment: submission.Quest.xp },
        ...(isLastQuest
          ? { status: params.timeExpired ? "TIME_EXPIRED" : "COMPLETED", completedAt: new Date() }
          : {}),
      },
    });
  }

  await logActivity({
    event: "FLOW_SUBMITTED",
    userId: params.userId,
    teamId: params.teamId,
    sessionId: params.sessionId,
    metadata: { submissionId: submission.id, timeExpired: params.timeExpired, totalScore: validation.totalScore },
    broadcastExtra: { tier: validation.tier },
  });

  return { submission: updatedSubmission, validation };
}

export { computeRationaleScore };

/**
 * Shared setup for every flow-builder quest page (2-5): auth + session-open
 * gate, resolves/starts the FlowSubmission, fires QUEST_STARTED once, and
 * auto-finalizes (redirecting to the result page) if the timer already ran
 * out server-side before the client ever mounted.
 */
export async function loadFlowQuestPageData(order: number, resultHref: string) {
  const user = await requireRole("PARTICIPANT");
  const enrollment = await getLatestEnrollment(user.id);
  if (!enrollment || !canParticipantPlay(enrollment.Session, enrollment)) redirect("/brief");

  const teamId = await ensureSoloTeam(enrollment.sessionId, user.id, user.displayName);
  const { items } = await getQuestList(enrollment.sessionId, teamId, user.id);
  const quest = items.find((i) => i.order === order);
  if (!quest) redirect("/brief");
  if (quest.state === "completed") redirect(resultHref);
  if (quest.state === "locked") redirect("/brief");

  const timeLimitMinutes = quest.timeLimitMinutes ?? 10;
  const submission = await getOrStartSubmission(teamId, quest.questId);

  if (submission.status === "DRAFT" && submission.startedAt) {
    const isFirstStart = Date.now() - submission.startedAt.getTime() < 2000;
    if (isFirstStart) {
      void logActivity({
        event: "QUEST_STARTED",
        userId: user.id,
        teamId,
        sessionId: enrollment.sessionId,
        metadata: { order, questId: quest.questId },
      });
    }
  }

  const remaining = remainingSeconds(submission.startedAt, timeLimitMinutes);
  if (submission.status === "DRAFT" && remaining <= 0) {
    await finalizeSubmission({
      submissionId: submission.id,
      teamId,
      questId: quest.questId,
      userId: user.id,
      sessionId: enrollment.sessionId,
      timeExpired: true,
    });
    redirect(resultHref);
  }

  const [nodes, connections] = await Promise.all([
    prisma.flowNode.findMany({ where: { submissionId: submission.id } }),
    prisma.flowConnection.findMany({ where: { submissionId: submission.id } }),
  ]);

  return { submissionId: submission.id, nodes, connections, remaining };
}
