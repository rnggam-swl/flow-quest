import "server-only";
import { prisma } from "@/lib/prisma";
import { orderNodesForDisplay, getRubricMax } from "@/lib/flowScoring";
import { QUEST1_OPTIONS } from "@/lib/quest1Content";
import type { ActivityLog } from "@/generated/prisma/client";

const REVISION_EVENTS = ["NODE_CREATED", "NODE_DELETED", "NODE_CONNECTED", "NODE_DISCONNECTED"] as const;

function getMeta(log: { metadata: unknown }): Record<string, unknown> {
  return log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
    ? (log.metadata as Record<string, unknown>)
    : {};
}

export interface FocusLossEvent {
  order: number | null;
  awaySeconds: number | null;
  createdAt: Date;
}

export interface Quest1Report {
  order: 1;
  title: string;
  completed: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  timeSpentSeconds: number | null;
  selectedText: string | null;
  correct: boolean | null;
}

export interface FlowQuestReport {
  order: number;
  title: string;
  status: string | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  timeSpentSeconds: number | null;
  timeToFirstActionSeconds: number | null;
  revisionCount: number;
  totalScore: number | null;
  maxScore: number;
  flowSteps: string[];
  reflection: string | null;
}

export interface ParticipantReport {
  sessionParticipantId: string;
  userId: string;
  displayName: string;
  email: string;
  school: string | null;
  groupName: string | null;
  status: string;
  totalXp: number;
  quest1: Quest1Report | null;
  flowQuests: FlowQuestReport[];
  focusLoss: { count: number; totalAwaySeconds: number; events: FocusLossEvent[] };
}

/**
 * Assembles a full per-participant report (quest 1 answer, quest 2-5 flows/scores,
 * timing, revision counts, and focus-loss trips) for every participant in a session
 * in a small fixed number of bulk queries, instead of one round-trip per participant —
 * this backs both the admin participant-detail page and the CSV export, which both
 * need every participant's full history at once.
 */
export async function getSessionFullReport(sessionId: string): Promise<ParticipantReport[]> {
  const [participants, sessionQuests, teams] = await Promise.all([
    prisma.sessionParticipant.findMany({ where: { sessionId }, include: { User: true }, orderBy: { createdAt: "asc" } }),
    prisma.sessionQuest.findMany({ where: { sessionId }, orderBy: { order: "asc" }, include: { Quest: true } }),
    prisma.team.findMany({ where: { sessionId }, include: { TeamMember: true } }),
  ]);

  const teamIdByUserId = new Map<string, string>();
  teams.forEach((t) => t.TeamMember.forEach((m) => teamIdByUserId.set(m.userId, t.id)));
  const teamIds = teams.map((t) => t.id);
  const questIds = sessionQuests.map((sq) => sq.questId);

  const [flowSubmissions, sessionScopedLogs, teamScopedLogs, reflections] = await Promise.all([
    prisma.flowSubmission.findMany({
      where: { teamId: { in: teamIds }, questId: { in: questIds } },
      include: { FlowNode: true, FlowConnection: true, Score: true },
    }),
    // QUEST_STARTED / QUEST_COMPLETED / FOCUS_LOST are logged with sessionId set.
    prisma.activityLog.findMany({
      where: { sessionId, event: { in: ["QUEST_STARTED", "QUEST_COMPLETED", "FOCUS_LOST"] } },
    }),
    // NODE_* edit events are logged with only teamId set (no sessionId) — filter by team instead.
    prisma.activityLog.findMany({
      where: { teamId: { in: teamIds }, event: { in: [...REVISION_EVENTS] } },
    }),
    prisma.reflection.findMany({ where: { sessionId } }),
  ]);

  const submissionByTeamQuest = new Map(flowSubmissions.map((s) => [`${s.teamId}:${s.questId}`, s]));

  const logsByUser = new Map<string, ActivityLog[]>();
  const addLog = (l: ActivityLog) => {
    if (!l.userId) return;
    const list = logsByUser.get(l.userId) ?? [];
    list.push(l);
    logsByUser.set(l.userId, list);
  };
  sessionScopedLogs.forEach(addLog);
  teamScopedLogs.forEach(addLog);

  const reflectionByUserOrder = new Map<string, string>();
  reflections.forEach((r) => {
    const match = /Quest (\d+)/.exec(r.question);
    if (match) reflectionByUserOrder.set(`${r.userId}:${match[1]}`, r.answer);
  });

  const quest1SessionQuest = sessionQuests.find((sq) => sq.order === 1);
  const flowSessionQuests = sessionQuests.filter((sq) => sq.order >= 2);
  const byCreatedAtAsc = (a: ActivityLog, b: ActivityLog) => a.createdAt.getTime() - b.createdAt.getTime();

  return participants.map((p): ParticipantReport => {
    const userId = p.participantId;
    const teamId = teamIdByUserId.get(userId);
    const userLogs = logsByUser.get(userId) ?? [];

    let quest1: Quest1Report | null = null;
    if (quest1SessionQuest) {
      const startedLog = userLogs
        .filter((l) => l.event === "QUEST_STARTED" && getMeta(l).order === 1)
        .sort(byCreatedAtAsc)[0];
      const completedLog = userLogs
        .filter((l) => l.event === "QUEST_COMPLETED" && getMeta(l).order === 1)
        .sort(byCreatedAtAsc)[0];
      const meta = completedLog ? getMeta(completedLog) : {};
      const selectedIndex = typeof meta.selectedIndex === "number" ? meta.selectedIndex : null;
      quest1 = {
        order: 1,
        title: quest1SessionQuest.Quest.title,
        completed: Boolean(completedLog),
        startedAt: startedLog?.createdAt ?? null,
        completedAt: completedLog?.createdAt ?? null,
        timeSpentSeconds:
          startedLog && completedLog
            ? Math.round((completedLog.createdAt.getTime() - startedLog.createdAt.getTime()) / 1000)
            : null,
        selectedText: selectedIndex !== null ? (QUEST1_OPTIONS[selectedIndex]?.text ?? null) : null,
        correct: typeof meta.correct === "boolean" ? meta.correct : null,
      };
    }

    const flowQuests: FlowQuestReport[] = flowSessionQuests.map((sq): FlowQuestReport => {
      const max = getRubricMax(sq.order);
      const maxScore =
        max.goal + max.flow + max.logic + max.constraint + max.edgeCase + max.simplicity + (sq.order === 2 || sq.order === 5 ? 10 : 0);
      const submission = teamId ? submissionByTeamQuest.get(`${teamId}:${sq.questId}`) : undefined;

      if (!submission) {
        return {
          order: sq.order,
          title: sq.Quest.title,
          status: null,
          startedAt: null,
          submittedAt: null,
          timeSpentSeconds: null,
          timeToFirstActionSeconds: null,
          revisionCount: 0,
          totalScore: null,
          maxScore,
          flowSteps: [],
          reflection: null,
        };
      }

      const submissionLogs = userLogs.filter((l) => getMeta(l).submissionId === submission.id);
      const revisionLogs = submissionLogs.filter((l) => (REVISION_EVENTS as readonly string[]).includes(l.event));
      const firstActionLog = revisionLogs.sort(byCreatedAtAsc)[0];
      const orderedNodes = orderNodesForDisplay(submission.FlowNode, submission.FlowConnection);

      return {
        order: sq.order,
        title: sq.Quest.title,
        status: submission.status,
        startedAt: submission.startedAt,
        submittedAt: submission.submittedAt,
        timeSpentSeconds: submission.timeSpentSeconds,
        timeToFirstActionSeconds: firstActionLog
          ? Math.round((firstActionLog.createdAt.getTime() - submission.startedAt.getTime()) / 1000)
          : null,
        revisionCount: revisionLogs.length,
        totalScore: submission.Score?.totalScore ?? null,
        maxScore,
        flowSteps: orderedNodes.map((n) => n.label),
        reflection: reflectionByUserOrder.get(`${userId}:${sq.order}`) ?? null,
      };
    });

    const focusEvents = userLogs
      .filter((l) => l.event === "FOCUS_LOST")
      .sort(byCreatedAtAsc)
      .map((l): FocusLossEvent => {
        const meta = getMeta(l);
        return {
          order: typeof meta.order === "number" ? meta.order : null,
          awaySeconds: typeof meta.awaySeconds === "number" ? meta.awaySeconds : null,
          createdAt: l.createdAt,
        };
      });

    return {
      sessionParticipantId: p.id,
      userId,
      displayName: p.User.displayName,
      email: p.User.email,
      school: p.User.school,
      groupName: p.User.groupName,
      status: p.status,
      totalXp: p.totalXp,
      quest1,
      flowQuests,
      focusLoss: {
        count: focusEvents.length,
        totalAwaySeconds: focusEvents.reduce((sum, e) => sum + (e.awaySeconds ?? 0), 0),
        events: focusEvents,
      },
    };
  });
}
