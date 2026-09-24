import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth";
import { getLatestEnrollment } from "@/lib/participant";
import { ensureSoloTeam } from "@/lib/soloTeam";
import { canParticipantPlay } from "@/lib/sessionAccess";
import type { CaseContent, QuestContent } from "@/lib/content/case";
import { graphFromFlow, scoreFlow, type RubricResult } from "@/lib/content/rubric";
import {
  effectiveTimeLimit,
  flowQuestionOf,
  getSessionContent,
  lastQuestOrder,
  questOf,
  quizQuestionsOf,
} from "@/lib/content/sessionContent";
import type { Prisma, QuestAttempt } from "@/generated/prisma/client";

/**
 * Everything about playing a quest, for any quest a case defines: the quest
 * list with its lock/available/completed states, starting an attempt, the
 * timer, and completing it (XP, the participant's overall status). A quest
 * is done when its attempt leaves DRAFT; its quiz answers are QuestionResponse
 * rows and its flow canvas, if it has one, a FlowSubmission scored with the
 * question's rubric.
 */

export type QuestState = "locked" | "available" | "completed";

export interface QuestListItem {
  questId: string;
  order: number;
  title: string;
  objective: string;
  xp: number;
  timeLimitMinutes: number | null;
  state: QuestState;
}

export async function getQuestList(sessionParticipantId: string, sessionId: string, content: CaseContent): Promise<QuestListItem[]> {
  const [sessionQuests, attempts] = await Promise.all([
    prisma.sessionQuest.findMany({ where: { sessionId }, orderBy: { order: "asc" } }),
    prisma.questAttempt.findMany({ where: { sessionParticipantId } }),
  ]);
  const attemptByQuest = new Map(attempts.map((a) => [a.questId, a]));

  let previousDone = true;
  return sessionQuests.flatMap((sq) => {
    const quest = questOf(content, sq.order);
    if (!quest) return [];
    const attempt = attemptByQuest.get(sq.questId);
    const state: QuestState = attempt && attempt.status !== "DRAFT" ? "completed" : previousDone ? "available" : "locked";
    previousDone = state === "completed";
    return [
      {
        questId: sq.questId,
        order: sq.order,
        title: quest.title,
        objective: quest.objective,
        xp: quest.xp,
        timeLimitMinutes: effectiveTimeLimit(quest, sq.timeLimitMinutes),
        state,
      },
    ];
  });
}

export function remainingSeconds(startedAt: Date, timeLimitMinutes: number | null) {
  if (timeLimitMinutes === null) return null;
  const elapsedMs = Date.now() - startedAt.getTime();
  return Math.max(0, Math.ceil((timeLimitMinutes * 60 * 1000 - elapsedMs) / 1000));
}

/** Atomic get-or-create, so concurrent loads of the same quest never race into a unique-constraint error. */
async function startAttempt(sessionParticipantId: string, questId: string) {
  const attempt = await prisma.questAttempt.upsert({
    where: { sessionParticipantId_questId: { sessionParticipantId, questId } },
    update: {},
    create: { id: crypto.randomUUID(), sessionParticipantId, questId },
  });
  return { attempt, isNew: attempt.status === "DRAFT" && Date.now() - attempt.startedAt.getTime() < 2000 };
}

/**
 * Uses an atomic upsert (not a find-then-create) because React's dev-mode
 * double-invoke and concurrent navigations/prefetches can both hit this for
 * the same team+quest at once.
 */
export async function getOrStartSubmission(teamId: string, questId: string) {
  return prisma.flowSubmission.upsert({
    where: { teamId_questId: { teamId, questId } },
    update: {},
    create: { id: crypto.randomUUID(), teamId, questId, status: "DRAFT" },
  });
}

interface PlayContext {
  userId: string;
  displayName?: string;
  sessionId: string;
  sessionParticipantId: string;
  teamId: string;
  content: CaseContent;
}

/**
 * Moves an attempt out of DRAFT exactly once — the conditional update is the
 * guard, so a double submit or a timeout racing a submit can't award XP twice.
 */
export async function completeAttempt(attempt: QuestAttempt, quest: QuestContent, ctx: PlayContext, timeExpired: boolean) {
  const now = new Date();
  const { count } = await prisma.questAttempt.updateMany({
    where: { id: attempt.id, status: "DRAFT" },
    data: {
      status: timeExpired ? "TIME_EXPIRED" : "SUBMITTED",
      submittedAt: now,
      timeSpentSeconds: Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000),
    },
  });
  if (count === 0) return false;

  const isLast = quest.order >= lastQuestOrder(ctx.content);
  await prisma.sessionParticipant.update({
    where: { id: ctx.sessionParticipantId },
    data: {
      totalXp: { increment: quest.xp },
      ...(isLast ? { status: timeExpired ? "TIME_EXPIRED" : "COMPLETED", completedAt: now } : {}),
    },
  });
  void logActivity({
    event: "QUEST_COMPLETED",
    userId: ctx.userId,
    teamId: ctx.teamId,
    sessionId: ctx.sessionId,
    metadata: { order: quest.order, questId: attempt.questId, timeExpired },
    broadcastExtra: ctx.displayName ? { displayName: ctx.displayName } : undefined,
  });
  return true;
}

type LoadedSubmission = Prisma.FlowSubmissionGetPayload<{ include: { FlowNode: true; FlowConnection: true } }>;

export function scoreSubmission(content: CaseContent, quest: QuestContent, submission: Pick<LoadedSubmission, "FlowNode" | "FlowConnection">): RubricResult {
  const flow = flowQuestionOf(quest);
  if (!flow) throw new Error(`Quest ${quest.order} has no flow question`);
  return scoreFlow(flow.rubric, graphFromFlow(submission.FlowNode, submission.FlowConnection, content.nodes));
}

/**
 * Scores the flow canvas with the quest's rubric, saves the Score, locks the
 * submission, and completes the quest attempt (the canvas is always a quest's
 * last step, so every quiz question is answered by then).
 */
export async function finalizeFlowSubmission(submission: LoadedSubmission, attempt: QuestAttempt, quest: QuestContent, ctx: PlayContext, timeExpired: boolean) {
  const result = scoreSubmission(ctx.content, quest, submission);
  const s = result.scores;
  const scoreData = {
    goalScore: s.goal,
    flowScore: s.flow,
    logicScore: s.logic,
    constraintScore: s.constraint,
    edgeCaseScore: s.edgeCase,
    simplicityScore: s.simplicity,
    totalScore: result.total,
    updatedAt: new Date(),
  };
  const now = new Date();
  await Promise.all([
    prisma.flowSubmission.update({
      where: { id: submission.id },
      data: {
        status: timeExpired ? "TIME_EXPIRED" : "SUBMITTED",
        submittedAt: now,
        timeSpentSeconds: Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000),
      },
    }),
    prisma.score.upsert({
      where: { submissionId: submission.id },
      update: scoreData,
      create: { id: crypto.randomUUID(), submissionId: submission.id, ...scoreData },
    }),
  ]);
  await completeAttempt(attempt, quest, ctx, timeExpired);

  void logActivity({
    event: "FLOW_SUBMITTED",
    userId: ctx.userId,
    teamId: ctx.teamId,
    sessionId: ctx.sessionId,
    metadata: { submissionId: submission.id, timeExpired, totalScore: result.total },
    broadcastExtra: { tier: result.tier },
  });
  return result;
}

/** The time ran out: score whatever the canvas holds (if the quest has one) and close the attempt. */
async function expireAttempt(attempt: QuestAttempt, quest: QuestContent, ctx: PlayContext) {
  if (flowQuestionOf(quest)) {
    const submission = await prisma.flowSubmission.findUnique({
      where: { teamId_questId: { teamId: ctx.teamId, questId: attempt.questId } },
      include: { FlowNode: true, FlowConnection: true },
    });
    if (submission) {
      await finalizeFlowSubmission(submission, attempt, quest, ctx, true);
      return;
    }
  }
  await completeAttempt(attempt, quest, ctx, true);
}

/** Resolves the signed-in participant's context for a quest, or the reason they can't play it. */
export async function getPlayContext(userId: string, displayName: string) {
  const enrollment = await getLatestEnrollment(userId);
  if (!enrollment) return null;
  const session = await getSessionContent(enrollment.sessionId);
  if (!session) return null;
  const teamId = await ensureSoloTeam(enrollment.sessionId, userId, displayName);
  const ctx: PlayContext = {
    userId,
    displayName,
    sessionId: enrollment.sessionId,
    sessionParticipantId: enrollment.id,
    teamId,
    content: session.content,
  };
  return { enrollment, ctx };
}

/**
 * Shared setup for /quest/[order]: auth and the session/personal-deadline
 * gate, the quest's lock state, starting the attempt (logging QUEST_STARTED
 * once), and closing it server-side if its timer already ran out.
 */
export async function loadQuestPage(order: number) {
  const user = await requireRole("PARTICIPANT");
  const play = await getPlayContext(user.id, user.displayName);
  if (!play || !canParticipantPlay(play.enrollment.Session, play.enrollment)) redirect("/brief");
  const { ctx } = play;

  const items = await getQuestList(ctx.sessionParticipantId, ctx.sessionId, ctx.content);
  const item = items.find((i) => i.order === order);
  const quest = questOf(ctx.content, order);
  if (!item || !quest) redirect("/brief");
  if (item.state === "completed") redirect(`/result/${order}`);
  if (item.state === "locked") redirect("/brief");

  const { attempt, isNew } = await startAttempt(ctx.sessionParticipantId, item.questId);
  if (isNew) {
    void logActivity({ event: "QUEST_STARTED", userId: user.id, teamId: ctx.teamId, sessionId: ctx.sessionId, metadata: { order, questId: item.questId } });
  }

  const remaining = remainingSeconds(attempt.startedAt, item.timeLimitMinutes);
  if (remaining === 0) {
    await expireAttempt(attempt, quest, ctx);
    redirect(`/result/${order}`);
  }

  const responses = await prisma.questionResponse.findMany({ where: { attemptId: attempt.id } });
  const quiz = quizQuestionsOf(quest);
  const answered = new Set(responses.map((r) => r.questionKey));
  const flow = flowQuestionOf(quest);
  const onFlowStep = Boolean(flow) && quiz.every((q) => answered.has(q.id));

  let submission: LoadedSubmission | null = null;
  if (onFlowStep) {
    const s = await getOrStartSubmission(ctx.teamId, item.questId);
    submission = await prisma.flowSubmission.findUniqueOrThrow({ where: { id: s.id }, include: { FlowNode: true, FlowConnection: true } });
  }

  return { user, ctx, item, quest, attempt, responses, remaining, submission, isLast: order >= lastQuestOrder(ctx.content) };
}

export type QuestPageData = Awaited<ReturnType<typeof loadQuestPage>>;

export type ActiveQuest =
  | { ok: true; ctx: PlayContext; quest: QuestContent; attempt: QuestAttempt; item: QuestListItem }
  | { ok: false; status: 400 | 401 | 403 | 404 | 409; error: string };

/**
 * The gate every quest-answering API route goes through: enrolled, session open,
 * quest unlocked, attempt started and still running. A timer that ran out is
 * closed on the spot and reported as 409.
 */
export async function getActiveQuest(user: { id: string; displayName: string } | null, order: number): Promise<ActiveQuest> {
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  const play = await getPlayContext(user.id, user.displayName);
  if (!play) return { ok: false, status: 400, error: "Not enrolled" };
  if (!canParticipantPlay(play.enrollment.Session, play.enrollment)) return { ok: false, status: 403, error: "Session sedang tidak aktif" };
  const { ctx } = play;

  const items = await getQuestList(ctx.sessionParticipantId, ctx.sessionId, ctx.content);
  const item = items.find((i) => i.order === order);
  const quest = questOf(ctx.content, order);
  if (!item || !quest) return { ok: false, status: 404, error: "Quest tidak ditemukan" };
  if (item.state === "locked") return { ok: false, status: 403, error: "Quest belum terbuka" };

  const attempt = await prisma.questAttempt.findUnique({
    where: { sessionParticipantId_questId: { sessionParticipantId: ctx.sessionParticipantId, questId: item.questId } },
  });
  if (!attempt || attempt.status !== "DRAFT") return { ok: false, status: 409, error: "Quest ini sudah selesai" };
  if (remainingSeconds(attempt.startedAt, item.timeLimitMinutes) === 0) {
    await expireAttempt(attempt, quest, ctx);
    return { ok: false, status: 409, error: "Waktu habis" };
  }
  return { ok: true, ctx, quest, attempt, item };
}
