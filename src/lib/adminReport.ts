import "server-only";
import { prisma } from "@/lib/prisma";
import { orderNodesForDisplay } from "@/lib/flowScoring";
import { flowQuestionOf, getSessionContent, quizQuestionsOf } from "@/lib/content/sessionContent";
import { describeAnswer, describeCorrectAnswer } from "@/lib/content/describe";
import { QUESTION_TYPE_LABELS } from "@/lib/content/questions";
import { RUBRIC_CATEGORIES } from "@/lib/content/rubric";
import type { CaseContent } from "@/lib/content/case";
import type {
  ActivityLog,
  FlowConnection,
  FlowNode,
  QuestAttempt,
  QuestionResponse,
  Score,
  SessionParticipant,
  SessionQuest,
  User,
} from "@/generated/prisma/client";

/**
 * Per-participant reports for the admin pages and exports, for whatever
 * quests the session's case defines: each quest's attempt (status, timing),
 * its quiz answers read against the answer key, and — for a quest with a flow
 * question — the canvas, its score against the rubric's maxes, revisions and
 * the written reason.
 */

const REVISION_EVENTS = ["NODE_CREATED", "NODE_DELETED", "NODE_CONNECTED", "NODE_DISCONNECTED"] as const;

function getMeta(log: { metadata: unknown }): Record<string, unknown> {
  return log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata) ? (log.metadata as Record<string, unknown>) : {};
}

const byCreatedAtAsc = (a: ActivityLog, b: ActivityLog) => a.createdAt.getTime() - b.createdAt.getTime();

export interface FocusLossEvent {
  order: number | null;
  awaySeconds: number | null;
  createdAt: Date;
}

/** The participant's graph exactly as stored, so the admin pages can redraw it as a canvas instead of flattening it into one chain. */
export interface FlowGraphData {
  nodes: { id: string; label: string; nodeType: string; positionX: number; positionY: number; icon?: string }[];
  connections: { id: string; sourceNodeId: string; targetNodeId: string; connectionType: string }[];
}

export interface QuizAnswerReport {
  questionId: string;
  prompt: string;
  typeLabel: string;
  answered: boolean;
  answerText: string;
  correctText: string;
  correct: number;
  total: number;
}

export interface FlowPartReport {
  submissionId: string | null;
  timeToFirstActionSeconds: number | null;
  revisionCount: number;
  totalScore: number | null;
  maxScore: number;
  /** Flattened left-to-right reading of the flow — kept for the CSV export. */
  flowSteps: string[];
  graph: FlowGraphData;
  reflection: string | null;
}

export interface QuestReport {
  order: number;
  title: string;
  /** The attempt's status, or null if the participant never opened the quest. */
  status: string | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  timeSpentSeconds: number | null;
  quiz: QuizAnswerReport[];
  flow: FlowPartReport | null;
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
  quests: QuestReport[];
  focusLoss: { count: number; totalAwaySeconds: number; events: FocusLossEvent[] };
}

type FlowSubmissionWithDetail = {
  id: string;
  teamId: string;
  questId: string;
  FlowNode: FlowNode[];
  FlowConnection: FlowConnection[];
  Score: Score | null;
};

/** Shared lookup tables a report is built from — bulk-fetched once for a whole session, or scoped to one participant. */
interface ReportContext {
  content: CaseContent | null;
  sessionQuests: SessionQuest[];
  // A userId can map to more than one solo team from before ensureSoloTeam was race-proof; look across all of them.
  teamIdsByUserId: Map<string, string[]>;
  submissionByTeamQuest: Map<string, FlowSubmissionWithDetail>;
  attemptBySpQuest: Map<string, QuestAttempt & { QuestionResponse: QuestionResponse[] }>;
  logsByUser: Map<string, ActivityLog[]>;
  reflectionByUserOrder: Map<string, string>;
}

function assembleParticipantReport(p: SessionParticipant & { User: User }, ctx: ReportContext): ParticipantReport {
  const userId = p.participantId;
  const teamIds = ctx.teamIdsByUserId.get(userId) ?? [];
  const userLogs = ctx.logsByUser.get(userId) ?? [];
  const iconOf = new Map((ctx.content?.nodes ?? []).map((n) => [n.label, n.icon]));

  const quests: QuestReport[] = ctx.sessionQuests.flatMap((sq): QuestReport[] => {
    const quest = ctx.content?.quests.find((q) => q.order === sq.order);
    if (!quest) return [];
    const attempt = ctx.attemptBySpQuest.get(`${p.id}:${sq.questId}`);

    const quiz: QuizAnswerReport[] = quizQuestionsOf(quest).map((q) => {
      const r = attempt?.QuestionResponse.find((x) => x.questionKey === q.id);
      return {
        questionId: q.id,
        prompt: q.prompt,
        typeLabel: QUESTION_TYPE_LABELS[q.type],
        answered: Boolean(r),
        answerText: r ? describeAnswer(q, r.answer) : "",
        correctText: describeCorrectAnswer(q),
        correct: r?.correct ?? 0,
        total: r?.total ?? 0,
      };
    });

    let flow: FlowPartReport | null = null;
    const flowQuestion = flowQuestionOf(quest);
    if (flowQuestion) {
      const maxScore =
        RUBRIC_CATEGORIES.reduce((sum, c) => sum + (flowQuestion.rubric.scores[c]?.max ?? 0), 0) + (flowQuestion.reflection ? 10 : 0);
      const submission = teamIds
        .map((tid) => ctx.submissionByTeamQuest.get(`${tid}:${sq.questId}`))
        .find((s): s is FlowSubmissionWithDetail => s !== undefined);
      const revisionLogs = submission
        ? userLogs.filter((l) => getMeta(l).submissionId === submission.id && (REVISION_EVENTS as readonly string[]).includes(l.event))
        : [];
      const firstActionLog = [...revisionLogs].sort(byCreatedAtAsc)[0];
      flow = {
        submissionId: submission?.id ?? null,
        timeToFirstActionSeconds:
          firstActionLog && attempt ? Math.round((firstActionLog.createdAt.getTime() - attempt.startedAt.getTime()) / 1000) : null,
        revisionCount: revisionLogs.length,
        totalScore: submission?.Score?.totalScore ?? null,
        maxScore,
        flowSteps: submission ? orderNodesForDisplay(submission.FlowNode, submission.FlowConnection).map((n) => n.label) : [],
        graph: {
          nodes: (submission?.FlowNode ?? []).map((n) => ({
            id: n.id,
            label: n.label,
            nodeType: n.nodeType,
            positionX: n.positionX,
            positionY: n.positionY,
            icon: iconOf.get(n.label),
          })),
          connections: (submission?.FlowConnection ?? []).map((c) => ({
            id: c.id,
            sourceNodeId: c.sourceNodeId,
            targetNodeId: c.targetNodeId,
            connectionType: c.connectionType,
          })),
        },
        reflection: ctx.reflectionByUserOrder.get(`${userId}:${sq.order}`) ?? null,
      };
    }

    return [
      {
        order: sq.order,
        title: quest.title,
        status: attempt?.status ?? null,
        startedAt: attempt?.startedAt ?? null,
        submittedAt: attempt?.submittedAt ?? null,
        timeSpentSeconds: attempt?.timeSpentSeconds ?? null,
        quiz,
        flow,
      },
    ];
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
    quests,
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

async function loadAttempts(sessionParticipantIds: string[]) {
  const attempts = sessionParticipantIds.length
    ? await prisma.questAttempt.findMany({ where: { sessionParticipantId: { in: sessionParticipantIds } }, include: { QuestionResponse: true } })
    : [];
  return new Map(attempts.map((a) => [`${a.sessionParticipantId}:${a.questId}`, a]));
}

/**
 * Every participant of a session in a small fixed number of bulk queries,
 * instead of one round-trip per participant — this backs the CSV export.
 * For a single participant, use `getParticipantReport` instead.
 */
export async function getSessionFullReport(sessionId: string): Promise<ParticipantReport[]> {
  const [participants, sessionQuests, teams, session] = await Promise.all([
    prisma.sessionParticipant.findMany({ where: { sessionId }, include: { User: true }, orderBy: { createdAt: "asc" } }),
    prisma.sessionQuest.findMany({ where: { sessionId }, orderBy: { order: "asc" } }),
    prisma.team.findMany({ where: { sessionId }, include: { TeamMember: true } }),
    getSessionContent(sessionId),
  ]);

  const teamIdsByUserId = new Map<string, string[]>();
  teams.forEach((t) => t.TeamMember.forEach((m) => teamIdsByUserId.set(m.userId, [...(teamIdsByUserId.get(m.userId) ?? []), t.id])));
  const teamIds = teams.map((t) => t.id);

  const [flowSubmissions, sessionScopedLogs, teamScopedLogs, reflections, attemptBySpQuest] = await Promise.all([
    prisma.flowSubmission.findMany({
      where: { teamId: { in: teamIds }, questId: { in: sessionQuests.map((sq) => sq.questId) } },
      include: { FlowNode: true, FlowConnection: true, Score: true },
    }),
    prisma.activityLog.findMany({ where: { sessionId, event: "FOCUS_LOST" } }),
    // NODE_* edit events are logged with only teamId set (no sessionId) — filter by team instead.
    prisma.activityLog.findMany({ where: { teamId: { in: teamIds }, event: { in: [...REVISION_EVENTS] } } }),
    prisma.reflection.findMany({ where: { sessionId } }),
    loadAttempts(participants.map((p) => p.id)),
  ]);

  const logsByUser = new Map<string, ActivityLog[]>();
  addLogsByUser(logsByUser, sessionScopedLogs);
  addLogsByUser(logsByUser, teamScopedLogs);

  const ctx: ReportContext = {
    content: session?.content ?? null,
    sessionQuests,
    teamIdsByUserId,
    submissionByTeamQuest: new Map(flowSubmissions.map((s) => [`${s.teamId}:${s.questId}`, s])),
    attemptBySpQuest,
    logsByUser,
    reflectionByUserOrder: reflectionMap(reflections),
  };
  return participants.map((p) => assembleParticipantReport(p, ctx));
}

/** Same report as `getSessionFullReport`, with every query scoped to one participant. */
export async function getParticipantReport(sessionId: string, sessionParticipantId: string): Promise<ParticipantReport | null> {
  const [participant, sessionQuests, teams, session] = await Promise.all([
    prisma.sessionParticipant.findFirst({ where: { id: sessionParticipantId, sessionId }, include: { User: true } }),
    prisma.sessionQuest.findMany({ where: { sessionId }, orderBy: { order: "asc" } }),
    prisma.team.findMany({
      where: { sessionId, TeamMember: { some: { User: { SessionParticipant: { some: { id: sessionParticipantId } } } } } },
    }),
    getSessionContent(sessionId),
  ]);
  if (!participant) return null;
  const userId = participant.participantId;
  const teamIds = teams.map((t) => t.id);

  const [flowSubmissions, sessionScopedLogs, teamScopedLogs, reflections, attemptBySpQuest] = await Promise.all([
    teamIds.length
      ? prisma.flowSubmission.findMany({
          where: { teamId: { in: teamIds }, questId: { in: sessionQuests.map((sq) => sq.questId) } },
          include: { FlowNode: true, FlowConnection: true, Score: true },
        })
      : Promise.resolve([] as FlowSubmissionWithDetail[]),
    prisma.activityLog.findMany({ where: { sessionId, userId, event: "FOCUS_LOST" } }),
    teamIds.length
      ? prisma.activityLog.findMany({ where: { teamId: { in: teamIds }, event: { in: [...REVISION_EVENTS] } } })
      : Promise.resolve([] as ActivityLog[]),
    prisma.reflection.findMany({ where: { sessionId, userId } }),
    loadAttempts([participant.id]),
  ]);

  const logsByUser = new Map<string, ActivityLog[]>();
  addLogsByUser(logsByUser, sessionScopedLogs);
  addLogsByUser(logsByUser, teamScopedLogs);

  return assembleParticipantReport(participant, {
    content: session?.content ?? null,
    sessionQuests,
    teamIdsByUserId: teamIds.length ? new Map([[userId, teamIds]]) : new Map(),
    submissionByTeamQuest: new Map(flowSubmissions.map((s) => [`${s.teamId}:${s.questId}`, s])),
    attemptBySpQuest,
    logsByUser,
    reflectionByUserOrder: reflectionMap(reflections),
  });
}
