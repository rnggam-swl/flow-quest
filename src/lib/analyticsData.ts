import "server-only";
import { prisma } from "@/lib/prisma";
import { getSessionContent } from "@/lib/content/sessionContent";
import { flowQuestionOf, quizQuestionsOf } from "@/lib/content/questHelpers";
import { flowQuestionStats, median, quizQuestionStats, type QuestStats } from "@/lib/content/analytics";

/** Everything /admin/analitik shows for one session, in a fixed handful of bulk queries. */
export async function loadSessionAnalytics(sessionId: string): Promise<{ participants: number; caseTitle: string; version: number; quests: QuestStats[] } | null> {
  const pinned = await getSessionContent(sessionId);
  if (!pinned) return null;
  const [sessionQuests, enrollments, teams] = await Promise.all([
    prisma.sessionQuest.findMany({ where: { sessionId }, orderBy: { order: "asc" } }),
    prisma.sessionParticipant.findMany({ where: { sessionId }, select: { id: true } }),
    prisma.team.findMany({ where: { sessionId }, select: { id: true } }),
  ]);
  const questIds = sessionQuests.map((sq) => sq.questId);
  const [attempts, submissions] = await Promise.all([
    prisma.questAttempt.findMany({
      where: { sessionParticipantId: { in: enrollments.map((e) => e.id) }, questId: { in: questIds } },
      include: { QuestionResponse: true },
    }),
    prisma.flowSubmission.findMany({
      where: { teamId: { in: teams.map((t) => t.id) }, questId: { in: questIds }, status: { not: "DRAFT" } },
      include: { FlowNode: true, FlowConnection: true, Score: true },
    }),
  ]);

  const quests = sessionQuests.flatMap((sq): QuestStats[] => {
    const quest = pinned.content.quests.find((q) => q.order === sq.order);
    if (!quest) return [];
    const mine = attempts.filter((a) => a.questId === sq.questId);
    const done = mine.filter((a) => a.status !== "DRAFT");
    const rows = mine.flatMap((a) => a.QuestionResponse);
    const flow = flowQuestionOf(quest);
    return [
      {
        order: sq.order,
        title: quest.title,
        started: mine.length,
        completed: done.length,
        timedOut: done.filter((a) => a.status === "TIME_EXPIRED").length,
        medianMinutes: median(done.flatMap((a) => (a.timeSpentSeconds === null ? [] : [a.timeSpentSeconds / 60]))),
        quiz: quizQuestionsOf(quest).map((q) => quizQuestionStats(q, rows)),
        flow: flow
          ? flowQuestionStats(
              flow,
              submissions
                .filter((s) => s.questId === sq.questId)
                .map((s) => ({ nodes: s.FlowNode, connections: s.FlowConnection, total: s.Score?.totalScore ?? null })),
              pinned.content.nodes
            )
          : null,
      },
    ];
  });
  return { participants: enrollments.length, caseTitle: pinned.content.title, version: pinned.version, quests };
}
