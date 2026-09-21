import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { isSessionOpenNow } from "@/lib/sessionAccess";

/** Cached per request — the participant layout and every page under it (brief, quest/*) call this independently. */
export const getLatestEnrollment = cache(async (userId: string) => {
  return prisma.sessionParticipant.findFirst({
    where: { participantId: userId },
    orderBy: { createdAt: "desc" },
    include: { Session: true },
  });
});

export type QuestState = "locked" | "available" | "completed";

export interface QuestListItem {
  questId: string;
  order: number;
  title: string;
  objective: string;
  xp: number;
  timeLimitMinutes: number | null;
  state: QuestState;
  implemented: boolean;
}

/**
 * Builds the participant's quest list with derived lock/available/completed
 * state. Quest 1 completion is tracked via an ActivityLog QUEST_COMPLETED
 * event (it has no dedicated table); Quests 2-5 completion is read straight
 * off their FlowSubmission row, unlocked sequentially.
 */
export async function getQuestList(sessionId: string, teamId: string, userId: string) {
  const [sessionQuests, quest1CompletedLog] = await Promise.all([
    prisma.sessionQuest.findMany({
      where: { sessionId },
      orderBy: { order: "asc" },
      include: { Quest: true },
    }),
    prisma.activityLog.findFirst({
      where: { userId, sessionId, event: "QUEST_COMPLETED", metadata: { path: ["order"], equals: 1 } },
    }),
  ]);

  const flowSubmissions = await prisma.flowSubmission.findMany({
    where: { teamId, questId: { in: sessionQuests.filter((sq) => sq.order >= 2).map((sq) => sq.questId) } },
  });
  const submissionByQuestId = new Map(flowSubmissions.map((s) => [s.questId, s]));

  let previousDone = Boolean(quest1CompletedLog);
  const items: QuestListItem[] = sessionQuests.map((sq) => {
    const q = sq.Quest;
    let state: QuestState = "locked";

    if (q.order === 1) {
      state = quest1CompletedLog ? "completed" : "available";
    } else {
      const submission = submissionByQuestId.get(q.id);
      if (submission && submission.status !== "DRAFT") {
        state = "completed";
      } else if (previousDone) {
        state = "available";
      }
    }
    previousDone = state === "completed";

    return {
      questId: q.id,
      order: q.order,
      title: q.title,
      objective: q.objective,
      xp: q.xp,
      timeLimitMinutes: q.timeLimitMinutes,
      state,
      implemented: true,
    };
  });

  return { items, quest2Submission: submissionByQuestId.get(sessionQuests.find((sq) => sq.order === 2)?.questId ?? "") ?? null };
}

export async function assertSessionOpen(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  return isSessionOpenNow(session);
}
