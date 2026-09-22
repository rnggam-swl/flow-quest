import "server-only";
import { prisma } from "@/lib/prisma";
import { orderNodesForDisplay, getRubricMax } from "@/lib/flowScoring";
import { QUEST1_OPTIONS } from "@/lib/quest1Content";
import type { ActivityLog, FlowConnection, FlowNode, Score, SessionParticipant, SessionQuest, User, Quest } from "@/generated/prisma/client";

const REVISION_EVENTS = ["NODE_CREATED", "NODE_DELETED", "NODE_CONNECTED", "NODE_DISCONNECTED"] as const;

function getMeta(log: { metadata: unknown }): Record<string, unknown> {
  return log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
    ? (log.metadata as Record<string, unknown>)
    : {};
}

const byCreatedAtAsc = (a: ActivityLog, b: ActivityLog) => a.createdAt.getTime() - b.createdAt.getTime();

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

/** The participant's graph exactly as stored, so the admin pages can redraw it as a canvas instead of flattening it into one chain. */
export interface FlowGraphData {
  nodes: { id: string; label: string; nodeType: string; positionX: number; positionY: number }[];
  connections: { id: string; sourceNodeId: string; targetNodeId: string; connectionType: string }[];
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
  /** Flattened left-to-right reading of the flow — kept for the CSV export. */
  flowSteps: string[];
  graph: FlowGraphData;
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
  /** Orientation the participant built in, so the redrawn graph puts each decision node's Ya/Tidak outputs where they actually were. */
  flowViewMode: "VERTICAL" | "HORIZONTAL";
  quest1: Quest1Report | null;
  flowQuests: FlowQuestReport[];
  focusLoss: { count: number; totalAwaySeconds: number; events: FocusLossEvent[] };
}

type FlowSubmissionWithDetail = {
  id: string;
  teamId: string;
  questId: string;
  status: string;
  startedAt: Date;
  submittedAt: Date | null;
  timeSpentSeconds: number | null;
  FlowNode: FlowNode[];
  FlowConnection: FlowConnection[];
  Score: Score | null;
};

/** Shared lookup tables an assembled report is built from — bulk-fetched once for a whole session, or scoped to a single participant for the detail page. */
interface ReportContext {
  quest1SessionQuest: (SessionQuest & { Quest: Quest }) | undefined;
  flowSessionQuests: (SessionQuest & { Quest: Quest })[];
  // A userId can map to more than one team row — `ensureSoloTeam`'s check-then-create isn't
  // race-proof, so a user occasionally ends up with duplicate (mostly empty) solo teams in the
  // same session. We look across all of them rather than picking one arbitrarily, so a
  // participant's real submission isn't silently missed in favor of an empty duplicate.
  teamIdsByUserId: Map<string, string[]>;
  submissionByTeamQuest: Map<string, FlowSubmissionWithDetail>;
  logsByUser: Map<string, ActivityLog[]>;
  reflectionByUserOrder: Map<string, string>;
}

function assembleParticipantReport(
  p: SessionParticipant & { User: User },
  ctx: ReportContext
): ParticipantReport {
  const userId = p.participantId;
  const teamIds = ctx.teamIdsByUserId.get(userId) ?? [];
  const userLogs = ctx.logsByUser.get(userId) ?? [];

  let quest1: Quest1Report | null = null;
  if (ctx.quest1SessionQuest) {
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
      title: ctx.quest1SessionQuest.Quest.title,
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

  const flowQuests: FlowQuestReport[] = ctx.flowSessionQuests.map((sq): FlowQuestReport => {
    const max = getRubricMax(sq.order);
    const maxScore =
      max.goal + max.flow + max.logic + max.constraint + max.edgeCase + max.simplicity + (sq.order === 2 || sq.order === 5 ? 10 : 0);
    const submission = teamIds
      .map((tid) => ctx.submissionByTeamQuest.get(`${tid}:${sq.questId}`))
      .find((s): s is FlowSubmissionWithDetail => s !== undefined);

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
        graph: { nodes: [], connections: [] },
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
      graph: {
        nodes: submission.FlowNode.map((n) => ({
          id: n.id,
          label: n.label,
          nodeType: n.nodeType,
          positionX: n.positionX,
          positionY: n.positionY,
        })),
        connections: submission.FlowConnection.map((c) => ({
          id: c.id,
          sourceNodeId: c.sourceNodeId,
          targetNodeId: c.targetNodeId,
          connectionType: c.connectionType,
        })),
      },
      reflection: ctx.reflectionByUserOrder.get(`${userId}:${sq.order}`) ?? null,
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
    flowViewMode: p.User.flowViewMode,
    quest1,
    flowQuests,
    focusLoss: {
      count: focusEvents.length,
      totalAwaySeconds: focusEvents.reduce((sum, e) => sum + (e.awaySeconds ?? 0), 0),
      events: focusEvents,
    },
  };
}

function reflectionMap(reflections: { userId: string; question: string; answer: string }[]) {
  const map = new Map<string, string>();
  reflections.forEach((r) => {
    const match = /Quest (\d+)/.exec(r.question);
    if (match) map.set(`${r.userId}:${match[1]}`, r.answer);
  });
  return map;
}

function addLogsByUser(map: Map<string, ActivityLog[]>, logs: ActivityLog[]) {
  logs.forEach((l) => {
    if (!l.userId) return;
    const list = map.get(l.userId) ?? [];
    list.push(l);
    map.set(l.userId, list);
  });
}

/**
 * Assembles a full per-participant report (quest 1 answer, quest 2-5 flows/scores,
 * timing, revision counts, and focus-loss trips) for every participant in a session
 * in a small fixed number of bulk queries, instead of one round-trip per participant —
 * this backs the CSV export, which needs every participant's full history at once.
 * For a single participant, use `getParticipantReport` instead — it scopes every
 * query down to that one person rather than loading the whole session's data.
 */
export async function getSessionFullReport(sessionId: string): Promise<ParticipantReport[]> {
  const [participants, sessionQuests, teams] = await Promise.all([
    prisma.sessionParticipant.findMany({ where: { sessionId }, include: { User: true }, orderBy: { createdAt: "asc" } }),
    prisma.sessionQuest.findMany({ where: { sessionId }, orderBy: { order: "asc" }, include: { Quest: true } }),
    prisma.team.findMany({ where: { sessionId }, include: { TeamMember: true } }),
  ]);

  const teamIdsByUserId = new Map<string, string[]>();
  teams.forEach((t) =>
    t.TeamMember.forEach((m) => {
      const list = teamIdsByUserId.get(m.userId) ?? [];
      list.push(t.id);
      teamIdsByUserId.set(m.userId, list);
    })
  );
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

  const logsByUser = new Map<string, ActivityLog[]>();
  addLogsByUser(logsByUser, sessionScopedLogs);
  addLogsByUser(logsByUser, teamScopedLogs);

  const ctx: ReportContext = {
    quest1SessionQuest: sessionQuests.find((sq) => sq.order === 1),
    flowSessionQuests: sessionQuests.filter((sq) => sq.order >= 2),
    teamIdsByUserId,
    submissionByTeamQuest: new Map(flowSubmissions.map((s) => [`${s.teamId}:${s.questId}`, s])),
    logsByUser,
    reflectionByUserOrder: reflectionMap(reflections),
  };

  return participants.map((p) => assembleParticipantReport(p, ctx));
}

/**
 * Same report shape as `getSessionFullReport`, scoped to one participant — every
 * query filters by that participant's userId/teamId instead of the whole session,
 * so opening one participant's page doesn't pay for every other participant's
 * flow nodes, connections, and activity log rows too.
 */
export async function getParticipantReport(sessionId: string, sessionParticipantId: string): Promise<ParticipantReport | null> {
  // The team lookup is filtered through a nested relation (TeamMember -> User -> SessionParticipant)
  // instead of first awaiting the participant row for its userId — that turns what would otherwise
  // be a dependent 2nd round trip into one more query in the same parallel stage, which matters
  // given this app's DB round-trip latency (see getAdminOverview). It's `findMany`, not `findFirst`,
  // because `ensureSoloTeam`'s check-then-create isn't race-proof — a participant can end up with
  // more than one (mostly empty) solo team in the same session, and picking just one arbitrarily
  // risks picking an empty duplicate over the one that actually holds their submissions.
  const [participant, sessionQuests, teams] = await Promise.all([
    prisma.sessionParticipant.findFirst({ where: { id: sessionParticipantId, sessionId }, include: { User: true } }),
    prisma.sessionQuest.findMany({ where: { sessionId }, orderBy: { order: "asc" }, include: { Quest: true } }),
    prisma.team.findMany({
      where: { sessionId, TeamMember: { some: { User: { SessionParticipant: { some: { id: sessionParticipantId } } } } } },
    }),
  ]);
  if (!participant) return null;
  const userId = participant.participantId;
  const teamIds = teams.map((t) => t.id);
  const questIds = sessionQuests.map((sq) => sq.questId);

  const [flowSubmissions, sessionScopedLogs, teamScopedLogs, reflections] = await Promise.all([
    teamIds.length
      ? prisma.flowSubmission.findMany({
          where: { teamId: { in: teamIds }, questId: { in: questIds } },
          include: { FlowNode: true, FlowConnection: true, Score: true },
        })
      : Promise.resolve([] as FlowSubmissionWithDetail[]),
    prisma.activityLog.findMany({
      where: { sessionId, userId, event: { in: ["QUEST_STARTED", "QUEST_COMPLETED", "FOCUS_LOST"] } },
    }),
    teamIds.length
      ? prisma.activityLog.findMany({ where: { teamId: { in: teamIds }, event: { in: [...REVISION_EVENTS] } } })
      : Promise.resolve([] as ActivityLog[]),
    prisma.reflection.findMany({ where: { sessionId, userId } }),
  ]);

  const logsByUser = new Map<string, ActivityLog[]>();
  addLogsByUser(logsByUser, sessionScopedLogs);
  addLogsByUser(logsByUser, teamScopedLogs);

  const ctx: ReportContext = {
    quest1SessionQuest: sessionQuests.find((sq) => sq.order === 1),
    flowSessionQuests: sessionQuests.filter((sq) => sq.order >= 2),
    teamIdsByUserId: teamIds.length ? new Map([[userId, teamIds]]) : new Map(),
    submissionByTeamQuest: new Map(flowSubmissions.map((s) => [`${s.teamId}:${s.questId}`, s])),
    logsByUser,
    reflectionByUserOrder: reflectionMap(reflections),
  };

  return assembleParticipantReport(participant, ctx);
}
